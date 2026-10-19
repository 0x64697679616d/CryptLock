
const { connectDatabase, closeDatabase } = require('./database');

async function setupDatabase() {
    try {
        const db = await connectDatabase();

        await db.collection('users').createIndex(
            { username: 1 },
            { unique: true, name: 'unique_username' }
        );

        console.log('OK: Unique username index created.');
    } catch (error) {
        console.error('FAIL:', error.message);
        process.exitCode = 1;
    } finally {
        await closeDatabase();
    }
}

setupDatabase();
