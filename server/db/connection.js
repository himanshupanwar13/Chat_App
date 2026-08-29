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

mongoose.set('strictQuery', true);

mongoose
  .connect(mongoUri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  })
  .then(() => console.log('Connected to DB'))
  .catch((e) => console.error('Error connecting to MongoDB:', e?.message || e));

mongoose.connection.on('error', (err) => {
  console.error('MongoDB connection error:', err?.message || err);
});

mongoose.connection.on('disconnected', () => {
  console.warn('MongoDB disconnected. Attempting reconnection...');
});

module.exports = mongoose;
