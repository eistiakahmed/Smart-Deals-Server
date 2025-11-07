const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const serviceAccount = require('./smart-deals-firebase-adminKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

const logger = (req, res, next) => {
  console.log('logging info');
  next();
};

const verifyFirebaseToken = async (req, res, next) => {
  if (!req.headers.authorization) {
    return res.status(401).send({ message: 'unauthorized access' });
  }

  const token = req.headers.authorization.split(' ')[1];
  if (!token) {
    return res.status(401).send({ message: 'unauthorized access' });
  }

  // verify id token
  try {
    const userInfo = await admin.auth().verifyIdToken(token);
    req.token_email = userInfo.email;
    console.log('after token validation', { userInfo });
    next();
  } catch {
    return res.status(401).send({ message: 'unauthorized access' });
  }
};

// MongoDB connection URI
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@smartdb.3iheclp.mongodb.net/?appName=smartDB`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// Root route
app.get('/', (req, res) => {
  res.send('Smart Deals Server is Running Fast 🚀');
});

// Main function
async function run() {
  try {
    await client.connect();

    const smartDeals = client.db('SmartDB');
    const dealsCollection = smartDeals.collection('SmartDeals');
    const bidsCollection = smartDeals.collection('Bids');

    /* -----------------------------
       🔹 DEALS ROUTES
    ----------------------------- */

    // Get all deals
    app.get('/deals', async (req, res) => {
      const result = await dealsCollection.find().toArray();
      res.send(result);
    });

    // Get deals by user email
    app.get('/myProduct', async (req, res) => {
      const email = req.query.email;
      if (!email) {
        return res.status(400).send({ message: 'Email query is required' });
      }
      const result = await dealsCollection.find({ email }).toArray();
      res.send(result);
    });

    // Get single deal by ID
    app.get('/deals/:id', async (req, res) => {
      const id = req.params.id;
      const result = await dealsCollection.findOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    // Add new deal
    app.post('/deals', async (req, res) => {
      const newProduct = req.body;
      const result = await dealsCollection.insertOne(newProduct);
      res.send(result);
    });

    // Update deal
    app.put('/deals/:id', async (req, res) => {
      const id = req.params.id;
      const data = req.body;
      const filter = { _id: new ObjectId(id) };
      const update = { $set: data };
      const result = await dealsCollection.updateOne(filter, update);
      res.send(result);
    });

    // Delete deal
    app.delete('/deals/:id', async (req, res) => {
      const id = req.params.id;
      const result = await dealsCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    // Latest products (limit 6)
    app.get('/latestProduct', async (req, res) => {
      const result = await dealsCollection
        .find()
        .sort({ created_at: -1 })
        .limit(6)
        .toArray();
      res.send(result);
    });

    /* -----------------------------
       🔹 BIDS ROUTES
    ----------------------------- */

    app.get('/bids', logger, verifyFirebaseToken, async (req, res) => {
      console.log('headers', req);
      const email = req.query.email;
      try {
        if (email) {
          if (email !== req.token_email) {
            return res.status(403).send({ message: ' Forbidden access' });
          }
          const result = await bidsCollection
            .find({ buyer_email: email })
            .sort({ bid_price: -1 })
            .toArray();
          return res.send(result);
        } else {
          // Optional: return all bids (for admin)
          const result = await bidsCollection.find().toArray();
          return res.send(result);
        }
      } catch (error) {
        console.error('Error fetching bids:', error);
        res.status(500).send({ message: 'Server Error', error });
      }
    });

    // Get all bids for a specific product
    app.get(
      '/product/bids/:productId',
      verifyFirebaseToken,
      async (req, res) => {
        const productId = req.params.productId;
        const query = { product: productId };
        const result = await bidsCollection
          .find(query)
          .sort({ bid_price: -1 })
          .toArray();
        res.send(result);
      }
    );

    // Add a new bid
    app.post('/bids', async (req, res) => {
      const newBid = req.body;
      const result = await bidsCollection.insertOne(newBid);
      res.send(result);
    });

    // Delete a bid
    app.delete('/bids/:id', async (req, res) => {
      const id = req.params.id;
      const result = await bidsCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    /* -----------------------------
        TEST CONNECTION
    ----------------------------- */
    await client.db('admin').command({ ping: 1 });
    console.log(' Successfully connected to MongoDB!');
  } catch (error) {
    console.error(' MongoDB connection failed:', error);
  } finally {
    // await client.close();
  }
}

run().catch(console.dir);

// Server listen
app.listen(port, () => {
  console.log(` Smart Deals Server is running on port: ${port}`);
});
