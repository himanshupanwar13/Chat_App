const mongoose = require('mongoose');

const mongoUser = process.env.DB_USER;
const mongoPass = process.env.DB_PASS;
const mongoHost = 'cluster0.b8ckv.mongodb.net';
const mongoOptions = '?retryWrites=true&w=majority&appName=Cluster0';

const mongoUri =
  process.env.MONGODB_URI ||
  (mongoUser && mongoPass
    ? `mongodb+srv://${encodeURIComponent(mongoUser)}:${encodeURIComponent(mongoPass)}@${mongoHost}${mongoOptions}`
    : `mongodb+srv://${mongoHost}${mongoOptions}`);

mongoose
  .connect(mongoUri)
  .then(() => console.log('Connected to DB'))
  .catch((e) => console.log('Error connecting to MongoDB', e?.message || e));
