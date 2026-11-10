const {
  connectDatabase,
  getDatabase,
  closeDatabase
} = require('./database');

async function clearDemoData() {
  try {
    await connectDatabase();

    const db = getDatabase();

    const collections = [
      'users',
      'files',
      'folders',
      'encryptedFiles.files',
      'encryptedFiles.chunks'
    ];

    console.log('\nStarting CryptLock data cleanup...\n');

    for (const name of collections) {
      const result = await db.collection(name).deleteMany({});
      console.log(`${name}: deleted ${result.deletedCount} documents`);
    }

    console.log('\nAll CryptLock demo data cleared.');
    console.log('Collections and indexes preserved.');

  } catch (error) {
    console.error('Cleanup failed:', error.message);
    process.exitCode = 1;

  } finally {
    await closeDatabase();
  }
}

clearDemoData();
