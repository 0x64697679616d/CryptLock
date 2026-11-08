# CryptLock

CryptLock is a college semester project providing a web-based digital locker for encrypted file storage and management.

## Features
- Master-password registration and login
- Password hashing with bcrypt
- AES-256-GCM encryption and authenticated decryption
- File upload, listing, preview and download
- Folder organization, rename and move
- Trash, restore and permanent deletion
- 50 MB maximum upload size

## Technology Stack
- Frontend: HTML, CSS, JavaScript
- Server: Node.js and Express
- Encryption: C, OpenSSL, AES-256-GCM
- Password hashing: bcrypt
- Key derivation: scrypt
- Database: MongoDB

## Architecture
Browser -> Express API -> C encryption program -> encrypted local file storage

MongoDB stores account information and file metadata. Encrypted file contents are stored locally in data/files/.

## Requirements
- Node.js and npm
- MongoDB
- Ubuntu or WSL Ubuntu
- GCC and OpenSSL development libraries

## Setup
1. Clone the repository.
2. Run npm ci.
3. Create server/.env using server/.env.example.
4. Configure MONGODB_URI, MONGODB_DATABASE and SESSION_SECRET.
5. Build the C program using npm run build:locker from WSL Ubuntu.
6. Start the server using npm start.
7. Open http://localhost:3000.

## Testing
Run npm test from WSL Ubuntu to execute the AES-256-GCM test suite.

The tests cover normal encryption/decryption, empty files, binary files, large files, wrong-key rejection and ciphertext tampering.

## Account Model
The current application supports one master locker per MongoDB database. It does not currently provide separate user accounts.

## Security Limitations
- Express uses its default in-memory session store.
- Active encryption keys are held in server process memory.
- Restarting the server invalidates active sessions.
- Encrypted files are stored on the server's local filesystem.
- Decrypted previews and downloads use temporary server-side files.
- File deletion does not guarantee forensic erasure.

This is an educational project, not a production-ready storage service. Do not store highly sensitive or irreplaceable documents without an independent security review.

## License
ISC
