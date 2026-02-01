require('dotenv').config()
const express = require('express')
const cors = require('cors')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb')

const app = express()
const port = process.env.PORT || 3000

// ✅ Middleware
app.use(
  cors({
    origin: ["http://localhost:5173", "http://localhost:5174", "http://localhost:3000"],
    credentials: true,
  })
);

app.use(express.json())

// ✅ MongoDB URI
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@studymate-cluster.2teoe59.mongodb.net/?retryWrites=true&w=majority&appName=studymate-cluster`

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
})

// ✅ helper: ObjectId valid check
const isValidObjectId = (id) => ObjectId.isValid(id)

async function run() {
  try {
    await client.connect()
    await client.db("admin").command({ ping: 1 })
    console.log("MongoDB connected ✅")

    const db = client.db("studymateDB")
    const usersCollection = db.collection("users")
    const partnersCollection = db.collection("partners")
    const connectionsCollection = db.collection("connections")

    // ======================================================
    // ✅ USERS ROUTES (Practice)
    // ======================================================
    app.get('/users', async (req, res) => {
      const result = await usersCollection.find().toArray()
      res.send(result)
    })

    app.post('/users', async (req, res) => {
      const user = req.body
      if (!user?.name || !user?.email) {
        return res.status(400).send({ message: "name and email are required" })
      }
      const result = await usersCollection.insertOne(user)
      res.send(result)
    })

    app.get('/users/:id', async (req, res) => {
      const id = req.params.id
      if (!isValidObjectId(id)) return res.status(400).send({ message: "Invalid user id" })

      const result = await usersCollection.findOne({ _id: new ObjectId(id) })
      res.send(result)
    })

    app.patch('/users/:id', async (req, res) => {
      const id = req.params.id
      if (!isValidObjectId(id)) return res.status(400).send({ message: "Invalid user id" })

      const updatedData = req.body
      const result = await usersCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updatedData }
      )
      res.send(result)
    })

    app.delete('/users/:id', async (req, res) => {
      const id = req.params.id
      if (!isValidObjectId(id)) return res.status(400).send({ message: "Invalid user id" })

      const result = await usersCollection.deleteOne({ _id: new ObjectId(id) })
      res.send(result)
    })

    // ======================================================
    // ✅ PARTNERS ROUTES (Main Assignment)
    // ======================================================

    // ✅ Create Partner Profile
    app.post('/partners', async (req, res) => {
      const partner = req.body

      if (!partner?.name || !partner?.subject || !partner?.email) {
        return res.status(400).send({ message: "name, subject and email are required" })
      }

      // default values
      partner.rating = Number(partner.rating ?? 0)
      partner.partnerCount = Number(partner.partnerCount ?? 0)

      const result = await partnersCollection.insertOne(partner)
      res.send(result)
    })

    // ✅ Get all partners + search + sort
    // Example:
    // /partners?search=Math&sort=asc
    app.get('/partners', async (req, res) => {
      const search = req.query.search || ""
      const sort = req.query.sort || "" // "asc" / "desc"

      const query = search
        ? { subject: { $regex: search, $options: "i" } }
        : {}

      // Experience sort mapping
      const expOrder = { Beginner: 1, Intermediate: 2, Expert: 3 }

      const partners = await partnersCollection.find(query).toArray()

      if (sort === "asc" || sort === "desc") {
        partners.sort((a, b) => {
          const av = expOrder[a.experienceLevel] || 999
          const bv = expOrder[b.experienceLevel] || 999
          return sort === "asc" ? av - bv : bv - av
        })
      }

      res.send(partners)
    })

    // ✅ Top rated partners (Home page section)
    // /partners/top?limit=3
    app.get('/partners-top', async (req, res) => {
      const limit = Number(req.query.limit || 3)

      const result = await partnersCollection
        .find()
        .sort({ rating: -1 })
        .limit(limit)
        .toArray()

      res.send(result)
    })

    // ✅ Get single partner
    app.get('/partners/:id', async (req, res) => {
      const id = req.params.id
      if (!isValidObjectId(id)) return res.status(400).send({ message: "Invalid partner id" })

      const result = await partnersCollection.findOne({ _id: new ObjectId(id) })
      res.send(result)
    })

    // ✅ Update partner (My added partner profile update)
    app.patch('/partners/:id', async (req, res) => {
      const id = req.params.id
      if (!isValidObjectId(id)) return res.status(400).send({ message: "Invalid partner id" })

      const updatedData = req.body
      const result = await partnersCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updatedData }
      )
      res.send(result)
    })

    // ✅ Delete partner (My added partner profile delete)
    app.delete('/partners/:id', async (req, res) => {
      const id = req.params.id
      if (!isValidObjectId(id)) return res.status(400).send({ message: "Invalid partner id" })

      const result = await partnersCollection.deleteOne({ _id: new ObjectId(id) })
      res.send(result)
    })

    // ======================================================
    // ✅ CONNECTIONS ROUTES (My Connections + Partner Request)
    // ======================================================

    // ✅ Send Partner Request
    app.post('/connections', async (req, res) => {
      const { partnerId, requesterEmail } = req.body

      if (!partnerId || !requesterEmail) {
        return res.status(400).send({ message: "partnerId and requesterEmail are required" })
      }
      if (!isValidObjectId(partnerId)) {
        return res.status(400).send({ message: "Invalid partnerId" })
      }

      // ✅ duplicate prevent
      const existing = await connectionsCollection.findOne({ partnerId, requesterEmail })
      if (existing) {
        return res.status(409).send({ message: "You already sent request to this partner" })
      }

      // ✅ partner exists
      const partner = await partnersCollection.findOne({ _id: new ObjectId(partnerId) })
      if (!partner) return res.status(404).send({ message: "Partner not found" })

      // ✅ increment partnerCount
      await partnersCollection.updateOne(
        { _id: new ObjectId(partnerId) },
        { $inc: { partnerCount: 1 } }
      )

      // ✅ save connection request
      const requestDoc = {
        partnerId,
        requesterEmail,
        partnerName: partner.name,
        partnerImage: partner.profileimage,
        subject: partner.subject,
        studyMode: partner.studyMode,
        createdAt: new Date(),
      }

      const result = await connectionsCollection.insertOne(requestDoc)
      res.send(result)
    })

    // ✅ Get my connections: /connections?email=...
    app.get('/connections', async (req, res) => {
      const email = req.query.email
      if (!email) return res.status(400).send({ message: "email query is required" })

      const result = await connectionsCollection.find({ requesterEmail: email }).toArray()
      res.send(result)
    })

    // ✅ Update connection
    app.patch('/connections/:id', async (req, res) => {
      const id = req.params.id
      if (!isValidObjectId(id)) return res.status(400).send({ message: "Invalid connection id" })

      const updatedData = req.body
      const result = await connectionsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updatedData }
      )
      res.send(result)
    })

    // ✅ Delete connection
    app.delete('/connections/:id', async (req, res) => {
      const id = req.params.id
      if (!isValidObjectId(id)) return res.status(400).send({ message: "Invalid connection id" })

      const result = await connectionsCollection.deleteOne({ _id: new ObjectId(id) })
      res.send(result)
    })

    console.log("Routes are ready ✅")

  } catch (error) {
    console.log("MongoDB connection failed ❌", error.message)
  }
}

run()

app.get('/', (req, res) => {
  res.send("StudyMate Server is running 🚀")
})

app.listen(port, () => {
  console.log(`Server running on port ${port}`)
})
