'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawn } = require('child_process');
const bcrypt = require('bcrypt');
const express = require('express');
const session = require('express-session');
const multer = require('multer');
const { ObjectId } = require('mongodb');
const { connectDatabase, getDatabase, closeDatabase } = require('./database');

require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const FILES_DIR = path.join(ROOT, 'data', 'files');
const UPLOADS_DIR = path.join(ROOT, 'uploads');
const TEMP_DIR = path.join(ROOT, 'temp');
const LOCKER_BIN = path.join(ROOT, 'backend', 'locker');
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const activeKeys = new Map();

for (const dir of [FILES_DIR, UPLOADS_DIR, TEMP_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  throw new Error('SESSION_SECRET must be set to a random value of at least 32 characters.');
}

app.disable('x-powered-by');
app.use(express.json({ limit: '16kb' }));
app.use(session({
  name: 'cryptlock.sid',
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 30 * 60 * 1000 }
}));

const upload = multer({
  dest: UPLOADS_DIR,
  limits: { fileSize: MAX_FILE_SIZE, files: 1 }
});

function deriveKey(password, salt) {
  return crypto.scryptSync(password, salt, 32, { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
}

function requireUnlocked(req, res, next) {
  const key = req.session && activeKeys.get(req.sessionID);
  if (!req.session || !req.session.authenticated || !key) {
    return res.status(401).json({ ok: false, error: 'Please unlock your locker again.' });
  }
  req.encryptionKey = key;
  req.userId = req.session.userId;
  next();
}

function runLocker(action, inputPath, outputPath, key) {
  return new Promise((resolve, reject) => {
    const child = spawn(LOCKER_BIN, [action, inputPath, outputPath], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve() : reject(new Error(stderr.trim() || `Locker exited with code ${code}`)));
    child.stdin.on('error', () => {});
    child.stdin.end(key);
  });
}

app.get('/api/health', (_req, res) => res.json({ ok: true, message: 'CryptLock server is running' }));

app.get('/api/auth/status', (req, res) => {
  res.json({ ok: true, authenticated: Boolean(req.session.authenticated && req.session.userId && activeKeys.has(req.sessionID)) });
});

app.post('/api/register', async (req, res) => {
  try {
    const username = typeof req.body?.username === 'string' ? req.body.username.trim().toLowerCase() : '';
    const { password } = req.body || {};
    const lockerName = typeof req.body?.lockerName === 'string' ? req.body.lockerName.trim() : 'My locker';

    if (!/^[a-z0-9_]{3,24}$/.test(username)) {
      return res.status(400).json({ ok: false, error: 'Username must be 3–24 characters using letters, numbers or underscores.' });
    }
    if (!lockerName || lockerName.length > 40 || /[\\/\\0]/.test(lockerName)) {
      return res.status(400).json({ ok: false, error: 'Locker name must be 1 to 40 characters and cannot contain slashes.' });
    }
    if (typeof password !== 'string' || password.length < 8 || password.length > 72) {
      return res.status(400).json({ ok: false, error: 'Master password must contain 8 to 72 characters.' });
    }

    const users = getDatabase().collection('users');
    const salt = crypto.randomBytes(16);
    const passwordHash = await bcrypt.hash(password, 12);
    const userId = new ObjectId().toString();

    await users.insertOne({
      _id: userId,
      username,
      passwordHash,
      kdfSalt: salt.toString('hex'),
      kdf: 'scrypt-N32768-r8-p1',
      lockerName,
      createdAt: new Date()
    });
    return res.status(201).json({ ok: true });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ ok: false, error: 'That username is already taken.' });
    console.error('Registration failed:', error.message);
    return res.status(500).json({ ok: false, error: 'Could not create the locker.' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const username = typeof req.body?.username === 'string' ? req.body.username.trim().toLowerCase() : '';
    const { password } = req.body || {};
    if (!/^[a-z0-9_]{3,24}$/.test(username) || typeof password !== 'string' || !password || password.length > 72) {
      return res.status(400).json({ ok: false, error: 'Enter your username and master password.' });
    }

    const account = await getDatabase().collection('users').findOne({ username });
    if (!account || !(await bcrypt.compare(password, account.passwordHash))) {
      return res.status(401).json({ ok: false, error: 'Incorrect username or master password.' });
    }

    const key = deriveKey(password, Buffer.from(account.kdfSalt, 'hex'));
    req.session.regenerate(error => {
      if (error) {
        key.fill(0);
        return res.status(500).json({ ok: false, error: 'Could not create a secure session.' });
      }
      req.session.authenticated = true;
      req.session.userId = String(account._id);
      req.session.username = account.username;
      req.session.save(saveError => {
        if (saveError) {
          key.fill(0);
          return res.status(500).json({ ok: false, error: 'Could not save your session.' });
        }
        activeKeys.set(req.sessionID, key);
        return res.json({ ok: true });
      });
    });
  } catch (error) {
    console.error('Login failed:', error.message);
    return res.status(500).json({ ok: false, error: 'Login failed.' });
  }
});

app.post('/api/logout', (req, res) => {
  if (req.sessionID) {
    const key = activeKeys.get(req.sessionID);
    if (key) key.fill(0);
    activeKeys.delete(req.sessionID);
  }
  if (!req.session) return res.json({ ok: true });
  req.session.destroy(error => {
    if (error) return res.status(500).json({ ok: false, error: 'Could not end the session.' });
    res.clearCookie('cryptlock.sid', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' });
    return res.json({ ok: true });
  });
});

app.get('/api/locker', requireUnlocked, async (req, res) => {
  try {
    const account = await getDatabase().collection('users').findOne({ _id: req.userId }, { projection: { lockerName: 1 } });
    return res.json({ ok: true, lockerName: account?.lockerName || 'My locker' });
  } catch (error) {
    console.error('Read locker profile failed:', error.message);
    return res.status(500).json({ ok: false, error: 'Could not load locker settings.' });
  }
});

app.patch('/api/locker', requireUnlocked, async (req, res) => {
  try {
    const lockerName = typeof req.body?.lockerName === 'string' ? req.body.lockerName.trim() : '';
    if (!lockerName || lockerName.length > 40 || /[\\/\0]/.test(lockerName)) {
      return res.status(400).json({ ok: false, error: 'Locker name must be 1 to 40 characters and cannot contain slashes.' });
    }
    await getDatabase().collection('users').updateOne({ _id: req.userId }, { $set: { lockerName } });
    return res.json({ ok: true, lockerName });
  } catch (error) {
    console.error('Update locker profile failed:', error.message);
    return res.status(500).json({ ok: false, error: 'Could not update locker name.' });
  }
});

app.get('/api/folders', requireUnlocked, async (req, res) => {
  try {
    const folderDocs = await getDatabase().collection('folders').find({ owner: req.userId }).sort({ name: 1 }).toArray();
    const counts = await getDatabase().collection('files').aggregate([
      { $match: { owner: req.userId, trashedAt: { $exists: false }, folderId: { $ne: null } } },
      { $group: { _id: '$folderId', count: { $sum: 1 } } }
    ]).toArray();
    const countMap = new Map(counts.map(x => [x._id, x.count]));
    return res.json({ ok: true, folders: folderDocs.map(f => ({ id: f._id.toString(), name: f.name, createdAt: f.createdAt, fileCount: countMap.get(f._id.toString()) || 0 })) });
  } catch (error) {
    console.error('List folders failed:', error.message);
    return res.status(500).json({ ok: false, error: 'Could not load your folders.' });
  }
});

app.post('/api/folders', requireUnlocked, async (req, res) => {
  try {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (!name || name.length > 80 || /[\\/\0]/.test(name)) return res.status(400).json({ ok: false, error: 'Folder name must be 1 to 80 characters and cannot contain slashes.' });
    const folders = getDatabase().collection('folders');
    if (await folders.findOne({ owner: req.userId, name: { $regex: `^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } })) return res.status(409).json({ ok: false, error: 'A folder with that name already exists.' });
    const doc = { owner: req.userId, name, createdAt: new Date() };
    const result = await folders.insertOne(doc);
    return res.status(201).json({ ok: true, folder: { id: result.insertedId.toString(), name, createdAt: doc.createdAt } });
  } catch (error) {
    console.error('Create folder failed:', error.message);
    return res.status(500).json({ ok: false, error: 'Could not create this folder.' });
  }
});

app.delete('/api/folders/:id', requireUnlocked, async (req, res) => {
  try {
    if (!/^[a-f0-9]{24}$/i.test(req.params.id)) return res.status(400).json({ ok: false, error: 'Invalid folder ID.' });
    const { ObjectId } = require('mongodb');
    const id = new ObjectId(req.params.id), folders = getDatabase().collection('folders');
    const folder = await folders.findOne({ _id: id, owner: req.userId });
    if (!folder) return res.status(404).json({ ok: false, error: 'Folder not found.' });
    const hasFiles = await getDatabase().collection('files').findOne({ owner: req.userId, folderId: id.toString(), trashedAt: { $exists: false } });
    if (hasFiles) return res.status(409).json({ ok: false, error: 'Move the files out of this folder before deleting it.' });
    await folders.deleteOne({ _id: id, owner: req.userId });
    return res.json({ ok: true });
  } catch (error) {
    console.error('Delete folder failed:', error.message);
    return res.status(500).json({ ok: false, error: 'Could not delete this folder.' });
  }
});

app.get('/api/files', requireUnlocked, async (req, res) => {
  try {
    const docs = await getDatabase().collection('files')
      .find({ owner: req.userId }, { projection: { storedName: 0 } })
      .sort({ createdAt: -1 }).toArray();
    const folderDocs = await getDatabase().collection('folders').find({ owner: req.userId }).toArray();
    const folderMap = new Map(folderDocs.map(f => [f._id.toString(), f.name]));
    const files = docs.map(f => ({ id: f._id.toString(), name: f.originalName, size: f.size, createdAt: f.createdAt, folderId: f.folderId || null, folderName: f.folderId ? (folderMap.get(f.folderId) || 'Unknown folder') : 'All files', trashedAt: f.trashedAt || null }));
    return res.json({ ok: true, files });
  } catch (error) {
    console.error('List files failed:', error.message);
    return res.status(500).json({ ok: false, error: 'Could not load your files.' });
  }
});

app.post('/api/files', requireUnlocked, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: 'Choose a file first.' });
  const storedName = `${crypto.randomUUID()}.clck`;
  const encryptedPath = path.join(FILES_DIR, storedName);
  try {
    await runLocker('encrypt', req.file.path, encryptedPath, req.encryptionKey);
    let folderId = null;
    if (req.body?.folderId) {
      const { ObjectId } = require('mongodb');
      if (!/^[a-f0-9]{24}$/i.test(req.body.folderId) || !(await getDatabase().collection('folders').findOne({ _id: new ObjectId(req.body.folderId), owner: req.userId }))) throw new Error('Selected folder does not exist.');
      folderId = req.body.folderId;
    }
    const doc = {
      owner: req.userId,
      originalName: path.basename(req.file.originalname).slice(0, 255),
      storedName,
      size: req.file.size,
      folderId,
      createdAt: new Date()
    };
    const result = await getDatabase().collection('files').insertOne(doc);
    return res.status(201).json({ ok: true, file: { id: result.insertedId.toString(), name: doc.originalName, size: doc.size, createdAt: doc.createdAt } });
  } catch (error) {
    fs.rmSync(encryptedPath, { force: true });
    console.error('Upload failed:', error.message);
    return res.status(500).json({ ok: false, error: 'File encryption or storage failed.' });
  } finally {
    fs.rmSync(req.file.path, { force: true });
  }
});

const PREVIEW_TYPES = {
  '.pdf': 'application/pdf',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp',
  // Browser-native media formats. Codec support still depends on the browser.
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.ogv': 'video/ogg',
  '.mov': 'video/quicktime', '.mkv': 'video/x-matroska', '.avi': 'video/x-msvideo',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.flac': 'audio/flac',
  '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.csv': 'text/plain; charset=utf-8',
  '.json': 'text/plain; charset=utf-8', '.xml': 'text/plain; charset=utf-8', '.log': 'text/plain; charset=utf-8',
  '.c': 'text/plain; charset=utf-8', '.h': 'text/plain; charset=utf-8', '.cc': 'text/plain; charset=utf-8', '.cpp': 'text/plain; charset=utf-8', '.cxx': 'text/plain; charset=utf-8', '.hpp': 'text/plain; charset=utf-8', '.hxx': 'text/plain; charset=utf-8',
  '.py': 'text/plain; charset=utf-8', '.js': 'text/plain; charset=utf-8', '.ts': 'text/plain; charset=utf-8',
  '.html': 'text/plain; charset=utf-8', '.css': 'text/plain; charset=utf-8', '.java': 'text/plain; charset=utf-8', '.jsx': 'text/plain; charset=utf-8', '.tsx': 'text/plain; charset=utf-8', '.cs': 'text/plain; charset=utf-8',
  '.sql': 'text/plain; charset=utf-8', '.php': 'text/plain; charset=utf-8', '.go': 'text/plain; charset=utf-8',
  '.rs': 'text/plain; charset=utf-8', '.sh': 'text/plain; charset=utf-8', '.bash': 'text/plain; charset=utf-8', '.yaml': 'text/plain; charset=utf-8', '.yml': 'text/plain; charset=utf-8', '.toml': 'text/plain; charset=utf-8', '.ini': 'text/plain; charset=utf-8', '.conf': 'text/plain; charset=utf-8', '.rb': 'text/plain; charset=utf-8', '.swift': 'text/plain; charset=utf-8', '.kt': 'text/plain; charset=utf-8', '.dart': 'text/plain; charset=utf-8', '.r': 'text/plain; charset=utf-8', '.lua': 'text/plain; charset=utf-8', '.env': 'text/plain; charset=utf-8', '.mk': 'text/plain; charset=utf-8'
};

app.get('/api/files/:id/preview', requireUnlocked, async (req, res) => {
  let plainPath;
  try {
    if (!/^[a-f0-9]{24}$/i.test(req.params.id)) return res.status(400).json({ ok: false, error: 'Invalid file ID.' });
    const { ObjectId } = require('mongodb');
    const doc = await getDatabase().collection('files').findOne({ _id: new ObjectId(req.params.id), owner: req.userId, trashedAt: { $exists: false } });
    if (!doc) return res.status(404).json({ ok: false, error: 'File not found.' });
    const ext = path.extname(doc.originalName).toLowerCase();
    const contentType = PREVIEW_TYPES[ext];
    if (!contentType) return res.status(415).json({ ok: false, error: 'Preview is not available for this file type. Download it instead.' });
    // Preview decrypts the complete file before sending it; keep this bounded by the upload limit.
    if (doc.size > MAX_FILE_SIZE) return res.status(413).json({ ok: false, error: 'Preview is limited to files up to 50 MB. Download this file instead.' });
    plainPath = path.join(TEMP_DIR, `${crypto.randomUUID()}.preview`);
    await runLocker('decrypt', path.join(FILES_DIR, doc.storedName), plainPath, req.encryptionKey);
    res.status(200);
    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename="${path.basename(doc.originalName).replace(/[\"\r\n]/g, '_')}"`,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cache-Control': 'no-store, private',
      'Content-Length': String(fs.statSync(plainPath).size)
    });
    // Capture the actual path before clearing the outer variable. The close
    // handlers run asynchronously, after plainPath has been set to null.
    const previewPath = plainPath;
    const cleanupPreview = () => {
      try {
        if (previewPath) fs.rmSync(previewPath, { force: true });
      } catch (cleanupError) {
        console.error('Preview cleanup failed:', cleanupError.message);
      }
    };

    const stream = fs.createReadStream(previewPath);
    stream.on('error', error => {
      console.error('Preview stream failed:', error.message);
      cleanupPreview();
      if (!res.headersSent) res.status(500).end();
      else res.destroy(error);
    });
    stream.on('close', cleanupPreview);
    res.on('close', cleanupPreview);
    stream.pipe(res);
    plainPath = null;
  } catch (error) {
    if (plainPath) fs.rmSync(plainPath, { force: true });
    console.error('Preview failed:', error.message);
    return res.status(500).json({ ok: false, error: 'Could not decrypt or preview this file.' });
  }
});

app.get('/api/files/:id/download', requireUnlocked, async (req, res) => {
  let plainPath;
  try {
    if (!/^[a-f0-9]{24}$/i.test(req.params.id)) return res.status(400).json({ ok: false, error: 'Invalid file ID.' });
    const { ObjectId } = require('mongodb');
    const doc = await getDatabase().collection('files').findOne({ _id: new ObjectId(req.params.id), owner: req.userId, trashedAt: { $exists: false } });
    if (!doc) return res.status(404).json({ ok: false, error: 'File not found.' });
    plainPath = path.join(TEMP_DIR, `${crypto.randomUUID()}.download`);
    await runLocker('decrypt', path.join(FILES_DIR, doc.storedName), plainPath, req.encryptionKey);
    res.download(plainPath, doc.originalName, error => {
      fs.rmSync(plainPath, { force: true });
      if (error) console.error('Download response failed:', error.message);
    });
  } catch (error) {
    if (plainPath) fs.rmSync(plainPath, { force: true });
    console.error('Download failed:', error.message);
    return res.status(500).json({ ok: false, error: 'Could not decrypt or download this file.' });
  }
});

app.patch('/api/files/:id/folder', requireUnlocked, async (req, res) => {
  try {
    if (!/^[a-f0-9]{24}$/i.test(req.params.id)) return res.status(400).json({ ok: false, error: 'Invalid file ID.' });
    const folderId = req.body?.folderId || null;
    const { ObjectId } = require('mongodb');
    if (folderId && (!/^[a-f0-9]{24}$/i.test(folderId) || !(await getDatabase().collection('folders').findOne({ _id: new ObjectId(folderId), owner: req.userId })))) return res.status(404).json({ ok: false, error: 'Destination folder not found.' });
    const result = await getDatabase().collection('files').updateOne({ _id: new ObjectId(req.params.id), owner: req.userId, trashedAt: { $exists: false } }, { $set: { folderId } });
    if (!result.matchedCount) return res.status(404).json({ ok: false, error: 'File not found.' });
    return res.json({ ok: true });
  } catch (error) {
    console.error('Move file failed:', error.message);
    return res.status(500).json({ ok: false, error: 'Could not move this file.' });
  }
});

app.patch('/api/files/:id/rename', requireUnlocked, async (req, res) => {
  try {
    if (!/^[a-f0-9]{24}$/i.test(req.params.id)) return res.status(400).json({ ok: false, error: 'Invalid file ID.' });
    const name = typeof req.body?.name === 'string' ? path.basename(req.body.name.trim()).slice(0, 255) : '';
    if (!name || name === '.' || name === '..') return res.status(400).json({ ok: false, error: 'Enter a valid file name.' });
    const { ObjectId } = require('mongodb');
    const result = await getDatabase().collection('files').updateOne({ _id: new ObjectId(req.params.id), owner: req.userId, trashedAt: { $exists: false } }, { $set: { originalName: name } });
    if (!result.matchedCount) return res.status(404).json({ ok: false, error: 'File not found.' });
    return res.json({ ok: true });
  } catch (error) {
    console.error('Rename file failed:', error.message);
    return res.status(500).json({ ok: false, error: 'Could not rename this file.' });
  }
});

app.delete('/api/files/:id', requireUnlocked, async (req, res) => {
  try {
    if (!/^[a-f0-9]{24}$/i.test(req.params.id)) return res.status(400).json({ ok: false, error: 'Invalid file ID.' });
    const { ObjectId } = require('mongodb');
    const result = await getDatabase().collection('files').updateOne({ _id: new ObjectId(req.params.id), owner: req.userId, trashedAt: { $exists: false } }, { $set: { trashedAt: new Date(), folderId: null } });
    if (!result.matchedCount) return res.status(404).json({ ok: false, error: 'File not found.' });
    return res.json({ ok: true });
  } catch (error) {
    console.error('Move to trash failed:', error.message);
    return res.status(500).json({ ok: false, error: 'Could not move this file to Trash.' });
  }
});

app.post('/api/files/:id/restore', requireUnlocked, async (req, res) => {
  try {
    if (!/^[a-f0-9]{24}$/i.test(req.params.id)) return res.status(400).json({ ok: false, error: 'Invalid file ID.' });
    const { ObjectId } = require('mongodb');
    const result = await getDatabase().collection('files').updateOne({ _id: new ObjectId(req.params.id), owner: req.userId, trashedAt: { $exists: true } }, { $unset: { trashedAt: '' } });
    if (!result.matchedCount) return res.status(404).json({ ok: false, error: 'Trashed file not found.' });
    return res.json({ ok: true });
  } catch (error) {
    console.error('Restore file failed:', error.message);
    return res.status(500).json({ ok: false, error: 'Could not restore this file.' });
  }
});

app.delete('/api/files/:id/permanent', requireUnlocked, async (req, res) => {
  try {
    if (!/^[a-f0-9]{24}$/i.test(req.params.id)) return res.status(400).json({ ok: false, error: 'Invalid file ID.' });
    const { ObjectId } = require('mongodb');
    const files = getDatabase().collection('files');
    const doc = await files.findOne({ _id: new ObjectId(req.params.id), owner: req.userId, trashedAt: { $exists: true } });
    if (!doc) return res.status(404).json({ ok: false, error: 'Trashed file not found.' });
    await files.deleteOne({ _id: doc._id, owner: req.userId });
    fs.rmSync(path.join(FILES_DIR, doc.storedName), { force: true });
    return res.json({ ok: true });
  } catch (error) {
    console.error('Permanent delete failed:', error.message);
    return res.status(500).json({ ok: false, error: 'Could not permanently delete this file.' });
  }
});

app.use(express.static(PUBLIC_DIR));
app.get('/', (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));

app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ ok: false, error: 'Maximum file size is 50 MB.' });
  }
  console.error('Unhandled request error:', error.message);
  return res.status(500).json({ ok: false, error: 'Unexpected server error.' });
});

async function startServer() {
  await connectDatabase();
  await getDatabase().collection('users').createIndex({ username: 1 }, { unique: true, name: 'unique_username' });
  await getDatabase().collection('files').createIndex({ owner: 1, createdAt: -1 });
  await getDatabase().collection('folders').createIndex({ owner: 1, name: 1 }, { unique: true });
  const server = app.listen(PORT, () => console.log(`CryptLock running at http://localhost:${PORT}`));
  const shutdown = async () => {
    server.close(async () => {
      for (const key of activeKeys.values()) key.fill(0);
      activeKeys.clear();
      await closeDatabase();
      process.exit(0);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

startServer().catch(error => {
  console.error('Failed to start CryptLock:', error.message);
  process.exit(1);
});
