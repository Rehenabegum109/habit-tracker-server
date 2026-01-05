

require("dotenv").config();
const express = require("express");
const bcrypt = require("bcrypt");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const admin = require("firebase-admin");
const serviceAccount = require("./habit-tracker-admin.json"); 

const port = process.env.PORT || 3000;
const app = express();

app.use(cors({ origin: "http://localhost:5173", credentials: true }));
app.use(express.json());


admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

let usersCollection, habitCollection;

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0134.xqhi49c.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
});

const verifyJWT = async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "Unauthorized access" });

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.decoded_email = decoded.email;
    next();
  } catch (err) {
    res.status(401).json({ message: "Invalid token" });
  }
};

const authorize = (role) => async (req, res, next) => {
  const user = await usersCollection.findOne({ email: req.decoded_email });
  if (!user || user.role !== role) return res.status(403).json({ message: "Forbidden" });
  next();
};


// ---------------- Utility ----------------
function calculateStreak(completionHistory) {
  if (!completionHistory || completionHistory.length === 0) return 0;

  const dates = completionHistory
    .map(d => new Date(d).setHours(0, 0, 0, 0))
    .sort((a, b) => b - a);

  let streak = 1;
  for (let i = 1; i < dates.length; i++) {
    const diff = (dates[i - 1] - dates[i]) / (1000 * 60 * 60 * 24);
    if (diff === 1) streak++;
    else if (diff > 1) break;
  }
  return streak;
}

// ---------------- Routes ----------------
async function run() {
  try {
    await client.connect();
    console.log("Connected to MongoDB");

    const db = client.db("habitTrackersDB");
    usersCollection = db.collection("users");
    habitCollection = db.collection("habits");

    // ------------- User Routes -------------
    
    // Get profile
    app.get("/users/me", verifyJWT, async (req, res) => {
      const email = req.decoded_email;
      const user = await usersCollection.findOne({ email }, { projection: { password: 0 } });
      res.json(user);
    });

    // Get role
    app.get("/users/role", verifyJWT, async (req, res) => {
      const email = req.decoded_email;
      const user = await usersCollection.findOne({ email });
      res.json({ role: user?.role || "user" });
    });

    // Create normal user (admin only)
    app.post("/users", verifyJWT, authorize("admin"), async (req, res) => {
      try {
        const { name, email, password, role = "user", photoURL } = req.body;
        const existing = await usersCollection.findOne({ email });
        if (existing) return res.status(400).json({ message: "User exists" });

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = { name, email, password: hashedPassword, role, photoURL, createdAt: new Date() };
        const result = await usersCollection.insertOne(newUser);
        res.status(201).json({ message: "User created", insertedId: result.insertedId });
      } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
      }
    });

    // Create admin (admin only)
    app.post("/users/admin", verifyJWT, authorize("admin"), async (req, res) => {
      try {
        const { name, email, password, photoURL } = req.body;
        const existing = await usersCollection.findOne({ email });
        if (existing) return res.status(400).json({ message: "User exists" });

        const hashedPassword = await bcrypt.hash(password, 10);
        const newAdmin = { name, email, password: hashedPassword, role: "admin", photoURL, createdAt: new Date() };
        const result = await usersCollection.insertOne(newAdmin);
        res.status(201).json({ message: "Admin created", insertedId: result.insertedId });
      } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
      }
    });

    
    app.get("/users", verifyJWT, authorize("admin"), async (req, res) => {
      try {
        const users = await usersCollection.find().project({ password: 0 }).toArray();
        res.json(users);
      } catch (err) {
        res.status(500).json({ message: "Server error" });
      }
    });



     app.patch("/users/:id", verifyJWT, authorize("admin"), async (req, res) => {
      try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid user ID" });

        const updates = req.body; // { role, status }
        const result = await usersCollection.updateOne({ _id: new ObjectId(id) }, { $set: updates });
        const updatedUser = await usersCollection.findOne({ _id: new ObjectId(id) }, { projection: { password: 0 } });
        res.json({ message: "User updated", updatedUser });
      } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
      }
    });

  
    app.delete("/users/:id", verifyJWT, authorize("admin"), async (req, res) => {
      try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid user ID" });

        await usersCollection.deleteOne({ _id: new ObjectId(id) });
        res.json({ message: "User deleted" });
      } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
      }
    });
    

    // ------------- Habit Routes -------------
    
    // Create habit
    app.post("/habits", async (req, res) => {
      const newHabit = { ...req.body, completionHistory: [], createdAt: new Date() };
      const result = await habitCollection.insertOne(newHabit);
      res.json({ success: true, message: "Habit added", result });
    });

    // Get all habits (optional filtering)
    app.get("/habits", async (req, res) => {
      const { userEmail, featured } = req.query;
      const filter = {};
      if (userEmail) filter.userEmail = userEmail;
      if (featured === "true") filter.public = true;

      const habits = await habitCollection.find(filter).sort({ createdAt: -1 }).limit(featured === "true" ? 6 : 0).toArray();
      const habitsWithStreak = habits.map(h => ({ ...h, currentStreak: calculateStreak(h.completionHistory) }));
      res.json(habitsWithStreak);
    });

    // Get public habits
    app.get("/habits/public", async (req, res) => {
      try {
        const habits = await habitCollection.find({ public: true }).toArray();
        const habitsWithStreak = habits.map(h => ({ ...h, currentStreak: calculateStreak(h.completionHistory) }));
        res.status(200).json(habitsWithStreak);
      } catch (err) {
        res.status(500).json({ message: "Failed to fetch public habits" });
      }
    });

    // Get habit by ID
    app.get("/habits/:id", async (req, res) => {
      const { id } = req.params;
      if (!ObjectId.isValid(id)) return res.status(400).json({ success: false, message: "Invalid habit ID" });

      const habit = await habitCollection.findOne({ _id: new ObjectId(id) });
      if (!habit) return res.status(404).json({ success: false, message: "Habit not found" });

      habit.currentStreak = calculateStreak(habit.completionHistory);
      res.json(habit);
    });

    // Update habit
    app.patch("/habits/:id", async (req, res) => {
      const { id } = req.params;
      if (!ObjectId.isValid(id)) return res.status(400).json({ success: false, message: "Invalid habit ID" });

      const updatedData = req.body;
      const result = await habitCollection.updateOne({ _id: new ObjectId(id) }, { $set: updatedData });
      res.json({ success: true, message: "Habit updated", result });
    });

    // Delete habit
    app.delete("/habits/:id", async (req, res) => {
      const { id } = req.params;
      if (!ObjectId.isValid(id)) return res.status(400).json({ success: false, message: "Invalid habit ID" });

      const result = await habitCollection.deleteOne({ _id: new ObjectId(id) });
      res.json({ success: true, message: "Habit deleted", result });
    });

    // Mark habit complete
    app.patch("/habits/:id/complete", async (req, res) => {
      const { id } = req.params;
      if (!ObjectId.isValid(id)) return res.status(400).json({ success: false, message: "Invalid habit ID" });

      const habit = await habitCollection.findOne({ _id: new ObjectId(id) });
      if (!habit) return res.status(404).json({ success: false, message: "Habit not found" });

      const today = new Date().toISOString().split("T")[0];
      const completionHistory = habit.completionHistory || [];

      if (completionHistory.includes(today)) {
        return res.json({ success: false, message: "Already completed today", currentStreak: calculateStreak(completionHistory) });
      }

      await habitCollection.updateOne({ _id: new ObjectId(id) }, { $push: { completionHistory: today } });
      const updatedHabit = await habitCollection.findOne({ _id: new ObjectId(id) });
      const currentStreak = calculateStreak(updatedHabit.completionHistory);

      res.json({ success: true, message: "Marked complete", updatedHabit, currentStreak });
    });

    console.log("All routes are set!");
  } catch (err) {
    console.error(err);
  }
}

run().catch(console.dir);


app.get("/", (req, res) => res.send("Server running..."));

app.listen(port, () => console.log(`Server running on port ${port}`));
