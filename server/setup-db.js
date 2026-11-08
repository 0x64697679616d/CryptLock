'use strict';

// Run once before starting the multi-user server:
// node server/migrate-multiuser.js
// This script is retained as a simple index/setup check.
const { connectDatabase, closeDatabase } = require('./database');

async function setupDatabase() {
  try {
    const db = await connectDatabase();
    await db.collection('users').createIndex({ username: 1 }, { unique: true, name: 'unique_username' });
    await db.collection('files').createIndex({ owner: 1, createdAt: -1 });
    await db.collection('folders').createIndex({ owner: 1, name: 1 }, { unique: true });
    console.log('OK: Multi-user indexes are ready.');
  } catch (error) {
    console.error('FAIL:', error.message);
    process.exitCode = 1;
  } finally {
    await closeDatabase();
  }
}

setupDatabase();
