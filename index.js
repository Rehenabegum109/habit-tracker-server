
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
      res.send(result);
    });

    // GET all habits
    app.get("/habits", async (req, res) => {
      const result = await habitCollection.find().toArray();
      res.send(result);
    });

    // PATCH habit (update streak)
    app.patch("/habits/:id", async (req, res) => {
      const id = req.params.id;
      const updatedData = req.body;
      const result = await habitCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updatedData }
      );
      res.send(result);
    });
        // Featured Habits Section route
    app.get("/habits/featured", async (req, res) => {
  const cursor = habitCollection.find({ public: true }).sort({ createdAt: -1 }).limit(6);
  const result = await cursor.toArray();
  res.send(result);
});

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

