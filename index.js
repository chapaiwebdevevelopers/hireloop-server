import express from 'express';
import cors from 'cors'
import 'dotenv/config'
import { MongoClient, ObjectId } from 'mongodb';
import Stripe from 'stripe'
const stripe= new Stripe(process.env.STRIPE_SECRET_KEY);
const app = express();
const port = process.env.port || 5000;

//middleware
app.use(express.json());
app.use(cors());
// MongoDB connection 
const client = new MongoClient(process.env.MONGODB_URI);
export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
    return client;
  } catch (err) {
    console.dir(err);
  }
}
const connectedClient = await connectToMongoDB()  
const database= connectedClient.db('hireloopdb')
const users = database.collection('user')
const jobs= database.collection('jobs')
const application= database.collection('application')
const payments= database.collection('payments')

// Call this only when your application terminates
// export async function disconnectFromMongoDB() {
//   await client.close();
// }

// Get Users Data by API 
app.get('/users',async (req,res)=>{
    const cursor = users.find({})
    const result = await cursor.toArray();
    res.send(result)
})
// get users permium by Id 
app.get('/users/:id/premium',async(req,res)=>{
    const id = req.params.id;
    const query = {_id: new ObjectId(id)}
    const result = await users.findOne(query,{projection:{premium:1}})
    res.send(result)

})
// role update api : Unfinished Api
app.patch('/users/:id',async(req,res)=>{
  const id = req.params.id
  console.log(req.body)
    const query = {_id:new ObjectId(id)}
    const role= {
      $set:{
        role:req.body.role,
      }
    }
    const result = await users.updateOne(query,role);
    res.send(result)
})
//API for  Creating job 
app.post('/jobs',async(req,res)=>{
  const job= req.body
  const result = await jobs.insertOne(job)
  res.send(result)
})
//API for  giving job list without login
app.get('/jobs', async (req, res) => {
  const query = {};
  if (req.query.userId) {
    query.userId = {
      $regex: `^${req.query.userId}$`,
      $options: "i"
    };
  }


  if (req.query.jobType) {
    query.jobType = {
      $regex: `^${req.query.jobType}$`,
      $options: "i"
    };
  }

  if (req.query.isRemote !== undefined) {
    query.isRemote = req.query.isRemote;
  }

  if (req.query.workMode) {
    query.workMode = {
      $regex: `^${req.query.workMode}$`,
      $options: "i"
    };
  }
    if (req.query.companyName) {
    query.companyName = {
      $regex: `^${req.query.companyName}$`,
      $options: "i"
    };
  }
  if(req.query.search){
    query.$or=[
      {title:{$regex:req.query.search, $options:'i'}},   // title will match with database and req.query.search will be search parameter value   option use for case incensitive
      {requirements:{$regex:req.query.search, $options:'i'}},
      {responsibilities:{$regex:req.query.search, $options:'i'}}
    ]
  }
  
  const result = await jobs.find(query).toArray();

  console.log("MongoDB Query:", query);

  res.send(result);
});
//API for  deleting single job

app.delete("/jobs/:id",async(req,res)=>{
  const id= req.params.id
  const query = {_id:new ObjectId(id)};
    const result = await jobs.deleteOne(query);
    res.send(result)
  
})
// update Job data
app.put("/jobs/:id", async (req, res) => {
  const id = req.params.id;
  console.log(id)
  
  const {_id ,...jobData}=req.body
  console.log(_id)
  console.log(jobData)
  const result = await jobs.updateOne(
    { _id: new ObjectId(id) },
    { $set: jobData }
  );

  res.send(result);
});

// get single job by Api 
app.get('/jobs/:id',async(req,res)=>{
  const id = req.params.id
  const result = await jobs.findOne({_id: new ObjectId(id)})

  res.send(result)
})
// get single job by Api 
app.get('/jobs/users/:id',async(req,res)=>{
  const id = req.params.id
  // const result={}
   const result =await jobs.find({userId:id}).toArray()

  res.send(result)
})


//applied job to send in databasess
app.post('/application',async(req,res)=>{
   const apps = req.body
   const result = await application.insertOne(apps)
   if (apps.jobId) {
     try {
       await jobs.updateOne(
         { _id: new ObjectId(apps.jobId) },
         { $inc: { applicants: 1 } }
       )
     } catch (e) {
       console.error("Error updating job applicants count:", e)
     }
   }
   res.send(result)
})
// Show Applied job According to User Id
app.get('/application',async(req,res)=>{
  const allQueries = {}
  
  if(req.query.id){
    //( userId will be match with mongodb property)  (id will be match with parameter from user frontend)
    allQueries.userId = req.query.id   
  }
  if(req.query.jobId){
    allQueries.jobId = req.query.jobId
  }
  // add the job whose by the userId
  if(req.query.userId){
    allQueries.userId=req.query.userId
  }
  if(req.query.jobId){
    allQueries.jobId=req.query.jobId
  }
  const cursor = application.find(allQueries)
   const result = await cursor.toArray();
  //  console.log(result)
   res.send(result)
})
// Count application by user
app.get('/application/count',async(req,res)=>{
  const allQueries = {}
  if(req.query.id){
//allqueries.userId = req.query.id          ( userId will be match with mongodb property)  (id will be match with parameter from user frontend)
    allQueries.userId = req.query.id   
  }
  if(req.query.jobId){
    allQueries.jobId = req.query.jobId
  }
const userAppliedJob = await application.countDocuments(allQueries)
res.send({count:userAppliedJob})
})

// update Status of application
app.patch(['/application/:id', '/applications/:id'], async (req, res) => {
  const id = req.params.id
  const query = {_id:new ObjectId(id)}
  const updatedDoc= {
    $set:{
      status:req.body.status
    }
  }
  const result= await application.updateOne(query,updatedDoc)
  res.send(result)
})



/**
 * Payments related api
 *  */ 
app.post('/payments/checkout-verify',async(req,res)=>{
  const {sessionId} =req.body;
  console.log(sessionId)
  const {
    status,
    payment_status,
   customer_email,
   metadata,
   payment_intent,
  } = await stripe.checkout.sessions.retrieve(sessionId)
  //1. verify payment Status => is used new session ?
  // 2. check is the session id for the currently logged in user ?
 //3. insert sessionId into the Payment collection
 // 4.update the user information as premium user
    if (status === 'complete' && payment_status==='paid') {
      const sessionQuery = {sessionId}
      const existingPayment = await payments.findOne(sessionQuery);
      if(existingPayment){
        return res.send({success:false, message:"Payment Already Verified"})
      }
        const payInfo = {
            sessionId,
            status,
            payment_status,
            customer_email,
            userId:metadata.userId,
            payment_date:new Date(),
            payment_intent,
        }
      const result = await payments.insertOne(payInfo);
      const updatedDoc={
        $set:{
          premium:true,
        }
      }
      const updateResult= await users.updateOne(
        {_id: new ObjectId(metadata.userId)},
        updatedDoc
      )
      res.send({ success:"true",result,updateResult})
    }
    res.send({success:false, message:'Payment verification failed'})
})



app.get('/', (req, res) => {
  res.send('Hello World!');
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});