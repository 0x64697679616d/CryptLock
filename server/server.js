const bcrypt = require('bcrypt');

const express = require('express');

const session = require('express-session');

const {
    connectDatabase,
    closeDatabase
} = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get('/api/health', (req, res) => {
    res.json({
        ok: true,
        message: 'CryptLock server is running'
    });
});

async function startServer() {
    try {
        await connectDatabase();

        app.listen(PORT, () => {
            console.log(`Server running at http://localhost:${PORT}`);
        });

    } catch (error) {
        console.error('Failed to start server:', error.message);
        process.exitCode = 1;
    }
}



app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (
            typeof username !== 'string' ||
            typeof password !== 'string' ||
            username.trim().length < 3 ||
            password.length < 8 ||
            password.length > 72
        ) {
            return res.status(400).json({
                ok: false,
                error: 'Username must be at least 3 characters and password must be 8-72 characters.'
            });
        }

        const db = require('./database').getDatabase();
        const users = db.collection('users');

        const existingUser = await users.findOne({
            username: username.trim()
        });

        if (existingUser) {
            return res.status(409).json({
                ok: false,
                error: 'Username already exists.'
            });
        }

        const passwordHash = await bcrypt.hash(password, 12);

        await users.insertOne({
            username: username.trim(),
            passwordHash,
            createdAt: new Date()
        });

        return res.status(201).json({ ok: true });

    } catch (error) {
        console.error('Registration failed:', error.message);

        return res.status(500).json({
            ok: false,
            error: 'Registration failed.'
        });
    }
});

app.use(session({
    name: 'cryptlock.sid',
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        maxAge: 30 * 60 * 1000
    }
}));


app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (
            typeof username !== 'string' ||
            typeof password !== 'string' ||
            !username.trim() ||
            !password
        ) {
            return res.status(400).json({
                ok: false,
                error: 'Username and password are required.'
            });
        }

        const db = require('./database').getDatabase();

        const user = await db.collection('users').findOne({
            username: username.trim()
        });

        if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
            return res.status(401).json({
                ok: false,
                error: 'Invalid username or password.'
            });
        }

        req.session.regenerate((error) => {
            if (error) {
                return res.status(500).json({
                    ok: false,
                    error: 'Could not create session.'
                });
            }

            req.session.userId = user._id.toString();

            req.session.save((saveError) => {
                if (saveError) {
                    return res.status(500).json({
                        ok: false,
                        error: 'Could not save session.'
                    });
                }

                return res.json({ ok: true });
            });
        });

    } catch (error) {
        console.error('Login failed:', error.message);

        return res.status(500).json({
            ok: false,
            error: 'Login failed.'
        });
    }
});


app.post('/api/logout', (req, res) => {
    if (!req.session) {
        return res.json({ ok: true });
    }

    req.session.destroy((error) => {
        if (error) {
            console.error('Logout failed:', error.message);

            return res.status(500).json({
                ok: false,
                error: 'Logout failed.'
            });
        }

        res.clearCookie('cryptlock.sid', {
            httpOnly: true,
            secure: false,
            sameSite: 'lax',
            path: '/'
        });

        return res.json({ ok: true });
    });
});


startServer();
