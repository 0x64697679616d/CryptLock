
require('dotenv').config({ path: 'server/.env' });

const { MongoClient } = require('mongodb');

const uri = process.env.MONGODB_URI;
const databaseName = process.env.MONGODB_DATABASE;

if (!uri || !databaseName) {
    throw new Error('MongoDB configuration is missing from server/.env');
}

const client = new MongoClient(uri);

let database;

async function connectDatabase() {
    if (database) {
        return database;
    }

    await client.connect();

    database = client.db(databaseName);

    console.log('MongoDB connected successfully.');

    return database;
}

function getDatabase() {
    if (!database) {
        throw new Error('Database is not connected yet.');
    }

    return database;
}

async function closeDatabase() {
    await client.close();
    database = undefined;
}

module.exports = {
    connectDatabase,
    getDatabase,
    closeDatabase
};
