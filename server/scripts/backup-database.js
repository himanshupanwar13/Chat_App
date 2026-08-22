require('dotenv').config();

const fs = require('fs/promises');
const path = require('path');
const mongoose = require('mongoose');
const { EJSON } = require('bson');

const mongoHost = 'cluster0.b8ckv.mongodb.net';
const mongoUri =
  process.env.MONGODB_URI ||
  (process.env.DB_USER && process.env.DB_PASS
    ? `mongodb+srv://${encodeURIComponent(process.env.DB_USER)}:${encodeURIComponent(process.env.DB_PASS)}@${mongoHost}?retryWrites=true&w=majority&appName=Cluster0`
    : `mongodb+srv://${mongoHost}?retryWrites=true&w=majority&appName=Cluster0`);

async function main() {
  const outputRoot = path.resolve(__dirname, '..', 'backups');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputDirectory = path.join(outputRoot, `mongodb-${timestamp}`);

  await mongoose.connect(mongoUri, { autoIndex: false, serverSelectionTimeoutMS: 15000 });
  const database = mongoose.connection.db;
  const collections = await database.listCollections().toArray();
  await fs.mkdir(outputDirectory, { recursive: true });

  const manifest = { database: database.databaseName, createdAt: new Date().toISOString(), collections: [] };
  for (const { name } of collections) {
    const documents = await database.collection(name).find({}).toArray();
    const filename = `${name}.ejson`;
    await fs.writeFile(path.join(outputDirectory, filename), EJSON.stringify(documents, null, 2), 'utf8');
    manifest.collections.push({ name, filename, documentCount: documents.length });
  }
  await fs.writeFile(path.join(outputDirectory, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  console.log(JSON.stringify({ outputDirectory, database: manifest.database, collections: manifest.collections }, null, 2));
}

main()
  .catch((error) => { console.error(error.message); process.exitCode = 1; })
  .finally(async () => { await mongoose.disconnect(); });
