
require('dotenv').config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");


const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json()); 

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0134.xqhi49c.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();
    console.log("Connected to MongoDB!");

    const db = client.db("habitTrackersDB");
    const habitCollection = db.collection("habits");

   // POST new habit
    app.post("/habits", async (req, res) => {
      const newHabit = req.body;
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

  res.send(habits);
});
// Public habits fetch
app.get("/habits/public", async (req, res) => {
  try {
    const habits = await habitCollection.find({ public: true }).toArray();
    res.status(200).json(habits);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch public habits" });
  }
});

  // GET single habit by ID
    app.get("/habits/:id", async (req, res) => {
  const { id } = req.params;

  
  if (!ObjectId.isValid(id)) {
    return res.status(400).send({ success: false, message: "Invalid habit ID" });
  }

  const habit = await habitCollection.findOne({ _id: new ObjectId(id) });

  if (!habit) {
    return res.status(404).send({ success: false, message: "Habit not found" });
  }

  res.send(habit);
});

    
    // PATCH / update habit
    app.patch("/habits/:id", async (req, res) => {
      const { id } = req.params;
      if (!ObjectId.isValid(id)) return res.status(400).send({ success: false, message: "Invalid habit ID" });

      const updatedData = req.body;
      const result = await habitCollection.updateOne({ _id: new ObjectId(id) }, { $set: updatedData });
      res.send({ success: true, message: "Habit updated", result });
    });
   


  // DELETE habit by ID
    app.delete("/habits/:id", async (req, res) => {
      const { id } = req.params;
      if (!ObjectId.isValid(id)) return res.status(400).send({ success: false, message: "Invalid habit ID" });

      const result = await habitCollection.deleteOne({ _id: new ObjectId(id) });
      res.send({ success: true, message: "Habit deleted", result });
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
  console.log(` Server running on port ${port}`);
});


