const express = require("express");
const app = express();
const cors = require("cors");
const { MongoClient, ObjectId } = require("mongodb");
require("dotenv").config();
const port = process.env.PORT || 5000;
const jwt = require("jsonwebtoken");
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

app.use(cors());
app.use(express.json());

const uri = `mongodb://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0-shard-00-00.pm6dl.mongodb.net:27017,cluster0-shard-00-01.pm6dl.mongodb.net:27017,cluster0-shard-00-02.pm6dl.mongodb.net:27017/?ssl=true&replicaSet=atlas-v78sao-shard-0&authSource=admin&retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({
      message: "UnAuthorized Access",
    });
  }
  const token = authHeader.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
    if (err) {
      return res.status(403).send({
        message: "Forbidden Access",
      });
    }
    req.decoded = decoded;
    next();
  });
}

async function run() {
  try {
    await client.connect();
    const productsCollection = client.db("All").collection("products");
    const userCollection = client.db("All").collection("users");
    const orderedCollection = client.db("All").collection("orders");
    const paymentCollection = client.db("All").collection("payments");

       //verify Admin
       const verifyAdmin = async (req, res, next) => {
        const requester = req.decoded.email;
        const requesterAccount = await userCollection.findOne({
          email: requester,
        });
        if (requesterAccount.role === "admin") {
          next();
        } else {
          res.status(403).send({
            message: "Forbidden",
          });
        }
      };

    // Get All Products
    app.get("/products", async (req, res) => {
      const query = {};
      const cursor = productsCollection.find(query);
      const products = await cursor.toArray();
      res.send(products.reverse());
    });

    //   Get Single product Details
    app.get("/productDetail/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const result = await productsCollection.findOne(query);

      console.log(id);
      res.send(result);
    });

    //Delete Products
    app.delete("/product/:id", verifyJWT, verifyAdmin, async(req, res) => {
      const id = req.params.id;
      const filter ={ _id: ObjectId(id) };
      const result = await productsCollection.deleteOne(filter);
      res.send(result);
    });

     //Add Product to data With Image
     app.post("/products", verifyJWT, verifyAdmin, async(req, res) => {
      const product = req.body;
      const result = await productsCollection.insertOne(product);
      res.send(result);
    });

      //  Get All Users
    app.get("/users", verifyJWT, async (req, res) => {
      const users = await userCollection.find().toArray();
      res.send(users);
    });

    // Collect My profile
    app.get('/myProfile/:email',async(req,res)=>{
        const email = req.params.email;
        const filter = {email:email}
        const result = await userCollection.findOne(filter);
        res.send(result);
    })

    app.patch('/myProfile/:email',async(req,res)=>{
      const email = req.params.email;
      const filter = {email:email}
      const user = req.body;
      const options = { upsert: true };
      const updateDoc ={
        $set:{
         name:user.name,
         home:user.home,
         education:user.education,
         link:user.link

        }
      }
      const result = await userCollection.updateOne(filter, updateDoc, options);
      res.send(result);
    })



    //Send Access Token to user
    app.put("/user/:email", async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const filter = {
        email: email,
      };
      const options = {
        upsert: true,
      };
      const updateDoc = {
        $set: user,
      };

      const result = await userCollection.updateOne(filter, updateDoc, options);
      const token = jwt.sign(
        {
          email: email,
        },
        process.env.ACCESS_TOKEN_SECRET,
        {
          expiresIn: "12h",
        }
      );
      res.send({
        result,
        token,
      });
    });


     //Add Admin User
     app.put("/user/admin/:email", verifyJWT,verifyAdmin,async (req, res) => {
      const email = req.params.email;

      const filter = {
        email: email,
      };
      const updateDoc = {
        $set: {
          role: "admin",
        },
      };
      const result = await userCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    
    ///Check Admin User
    app.get("/admin/:email", async (req, res) => {
      const email = req.params.email;
      const user = await userCollection.findOne({
        email: email,
      });
      const isAdmin = user.role === "admin";
      res.send({
        admin: isAdmin,
      });
    });
   


    //Add Order to data Base
    app.post("/order", async (req, res) => {
      const orders = req.body;
      const result = await orderedCollection.insertOne(orders);
      res.send({
        success: true,
        result,
      });
    });

    // Get All order for Admin
    app.get('/allOrders',async(req,res)=>{
       const orders = await orderedCollection.find().toArray();
       res.send(orders);
    })

    //Get Product For Payment
    app.get('/order/:id',verifyJWT,async(req,res)=>{
      const id = req.params.id;
      const query = {_id:ObjectId(id)}
      const order = await orderedCollection.findOne(query);
      res.send(order);
    })

      //Payment With stripe and Update
  app.patch('/order/:id',verifyJWT,async(req,res)=>{
    const id = req.params.id;
    const payment= req.body;
    const filter = {_id:ObjectId(id)};
    const updatedDoc = {
      $set:{
        paid:true,
        transactionId : payment.transactionId
      }
    }
    const result = await paymentCollection.insertOne(payment);
    const updatedBooking = await orderedCollection.updateOne(filter,updatedDoc);
    res.send(updatedDoc);
  })



    //Get Order From 
      app.get('/order',verifyJWT,async(req,res)=>{
        const customer = req.query.customer;
        const decodedEmail = req.decoded.email;
        if(customer === decodedEmail){
          const query = {
            customer : customer,
          };
          const order = await orderedCollection.find(query).toArray();
          return res.send(order.reverse())
        }
        else{
          return res.status(403).send({
            message: "Forbidden Access"
          })
        }
    })

    //Delete My Order
    app.delete("/order/:email", verifyJWT,async(req, res) => {
      const email = req.params.email;
      const filter ={customer:email}
      const result = await orderedCollection.deleteOne(filter);
      res.send(result);
    });

      //  stripe Api
  app.post('/create-payment-intent',verifyJWT, async(req,res)=>{
    const order = req.body;
    const price = order.totalPrice;
    const amount = price * 100;
    const paymentIntent = await stripe.paymentIntents.create({
      amount:amount,
      currency:'usd',
      payment_method_types: ['card'],
    })

    res.send({clientSecret: paymentIntent.client_secret,
    });

})  

// Ordered Shipped
  app.put('/order/shipped/:id',verifyJWT,async(req,res)=>{
      const id = req.params.id;
      const filter = {_id:ObjectId(id)};
      const updateDoc = {
        $set: {
          shipped: true,
        },
      };
      const result = await orderedCollection.updateOne(filter, updateDoc);
      res.send(result);

  })


  } finally {
  }
}

run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello Manufacture!");
});

app.listen(port, () => {
  console.log(`Listening to Port ${port}`);
});
