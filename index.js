require('dotenv').config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json()); 

// MongoDB connection
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0134.xqhi49c.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// Function to calculate current streak
function calculateStreak(completionHistory) {
  if (!completionHistory || completionHistory.length === 0) return 0;

  const dates = completionHistory
    .map(d => new Date(d).setHours(0,0,0,0))
    .sort((a,b) => b - a);

  let streak = 1;
  for (let i = 1; i < dates.length; i++) {
    const diff = (dates[i-1] - dates[i]) / (1000*60*60*24);
    if (diff === 1) streak++;
    else if (diff > 1) break;
  }
  return streak;
}

async function run() {
  try {
    await client.connect();
    console.log("Connected to MongoDB!");

    const db = client.db("habitTrackersDB");
    const habitCollection = db.collection("habits");

    
    app.post("/habits", async (req, res) => {
      const newHabit = { ...req.body, completionHistory: [] };
      const result = await habitCollection.insertOne(newHabit);
      res.send({ success: true, message: "Habit added", result });
    });

    
    // GET all habits
    
    app.get("/habits", async (req, res) => {
      const { userEmail, featured } = req.query;
      const filter = {};

      if (userEmail) filter.userEmail = userEmail;
      if (featured === "true") filter.public = true;

      const habits = await habitCollection
        .find(filter)
        .sort({ createdAt: -1 })
        .limit(featured === "true" ? 6 : 0)
        .toArray();

      
      const habitsWithStreak = habits.map(habit => ({
        ...habit,
        currentStreak: calculateStreak(habit.completionHistory)
      }));

      res.send(habitsWithStreak);
    });

    
    app.get("/habits/public", async (req, res) => {
      try {
        const habits = await habitCollection.find({ public: true }).toArray();
        const habitsWithStreak = habits.map(habit => ({
          ...habit,
          currentStreak: calculateStreak(habit.completionHistory)
        }));
        res.status(200).json(habitsWithStreak);
      } catch (error) {
        res.status(500).json({ message: "Failed to fetch public habits" });
      }
    });

    
    app.get("/habits/:id", async (req, res) => {
      const { id } = req.params;
      if (!ObjectId.isValid(id)) return res.status(400).send({ success: false, message: "Invalid habit ID" });

      const habit = await habitCollection.findOne({ _id: new ObjectId(id) });
      if (!habit) return res.status(404).send({ success: false, message: "Habit not found" });

      habit.currentStreak = calculateStreak(habit.completionHistory);
      res.send(habit);
    });

    
    app.patch("/habits/:id", async (req, res) => {
      const { id } = req.params;
      if (!ObjectId.isValid(id)) return res.status(400).send({ success: false, message: "Invalid habit ID" });

      const updatedData = req.body;
      const result = await habitCollection.updateOne({ _id: new ObjectId(id) }, { $set: updatedData });
      res.send({ success: true, message: "Habit updated", result });
    });

    // -------------------
    // DELETE habit
    // -------------------
    app.delete("/habits/:id", async (req, res) => {
      const { id } = req.params;
      if (!ObjectId.isValid(id)) return res.status(400).send({ success: false, message: "Invalid habit ID" });

      const result = await habitCollection.deleteOne({ _id: new ObjectId(id) });
      res.send({ success: true, message: "Habit deleted", result });
    });

    // -------------------
    // MARK habit as COMPLETE
    // -------------------
    app.patch("/habits/:id/complete", async (req, res) => {
      const { id } = req.params;
      if (!ObjectId.isValid(id)) return res.status(400).send({ success: false, message: "Invalid habit ID" });

      try {
        const habit = await habitCollection.findOne({ _id: new ObjectId(id) });
        if (!habit) return res.status(404).send({ success: false, message: "Habit not found" });

        const today = new Date().toISOString().split("T")[0];
        const completionHistory = habit.completionHistory || [];

        if (completionHistory.includes(today)) {
          return res.send({ success: false, message: "Already marked complete for today", currentStreak: calculateStreak(completionHistory) });
        }

        await habitCollection.updateOne(
          { _id: new ObjectId(id) },
          { $push: { completionHistory: today } }
        );

        const updatedHabit = await habitCollection.findOne({ _id: new ObjectId(id) });
        const currentStreak = calculateStreak(updatedHabit.completionHistory);

        res.send({ success: true, message: "Marked complete", updatedHabit, currentStreak });
      } catch (error) {
        console.error("Error marking complete:", error);
        res.status(500).send({ success: false, message: "Server error", error: error.message });
      }
    });

    console.log("All routes are set!");
  } catch (err) {
    console.error(err);
  }
}

run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Server is running...");
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});


