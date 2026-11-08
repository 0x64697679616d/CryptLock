'use strict';

const { connectDatabase, getDatabase, closeDatabase } = require('./database');

async function migrateLegacyLocker() {
  try {
    const db = await connectDatabase();
    const legacy = await db.collection('locker_account').findOne({ _id: 'master-locker' });

    if (legacy) {
      const users = db.collection('users');
      const alreadyMigrated = await users.findOne({ _id: 'master-locker' });

      if (!alreadyMigrated) {
        const usernameTaken = await users.findOne({ username: 'legacy' });
        if (usernameTaken) {
          throw new Error('Username "legacy" is already in use. Resolve this before migrating the existing locker.');
        }

        await users.insertOne({
          ...legacy,
          _id: 'master-locker',
          username: 'legacy',
          migratedFrom: 'locker_account',
          migratedAt: new Date()
        });
        console.log('Existing master locker migrated. Sign in with username: legacy');
      } else {
        console.log('Legacy locker already exists in users. No account copy needed.');
      }

      // Existing files and folders already use owner: "master-locker".
      // Keeping that ID preserves ownership and avoids moving encrypted files.
      const files = await db.collection('files').countDocuments({ owner: 'master-locker' });
      const folders = await db.collection('folders').countDocuments({ owner: 'master-locker' });
      console.log(`Preserved legacy data: ${files} file records, ${folders} folders.`);
    } else {
      console.log('No legacy master locker found. Fresh multi-user setup.');
    }

    await db.collection('users').createIndex({ username: 1 }, { unique: true, name: 'unique_username' });
    await db.collection('files').createIndex({ owner: 1, createdAt: -1 });
    await db.collection('folders').createIndex({ owner: 1, name: 1 }, { unique: true });
    console.log('Multi-user database indexes are ready.');
  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exitCode = 1;
  } finally {
    await closeDatabase();
  }
}

migrateLegacyLocker();
