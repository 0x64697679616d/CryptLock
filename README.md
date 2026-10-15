# CryptLock: Digital Locker

A college semester project that allows authenticated users to store, list, download, decrypt, and delete files through a web interface.

## Architecture

Browser (HTML, CSS, JavaScript) → Node.js / Express → C command-line program → MongoDB and local file storage.

## Technology Stack

- **Frontend:** HTML, CSS, JavaScript
- **Web server:** Node.js, Express
- **Backend logic:** C
- **Database:** MongoDB
- **Encryption:** XOR for initial development, followed by AES-256
- **Version control:** Git and GitHub

## Project Structure

- `backend/`: C implementation
- `server/`: Express API server
- `public/`: Web interface
- `data/files/`: Local storage for encrypted files

## Team Responsibilities

- Divyam: `backend/main.c`, `backend/auth.c`, `backend/crypto.c`, `backend/locker.c`, and `server/server.js`
- Friend A: `public/`
- Friend B: `backend/locker.h` and `backend/catalog.c`

## Development Status

Initial repository setup. Features will be implemented incrementally.

## Security Notice

This project is for educational development. Do not store real sensitive documents or passwords until the authentication, encryption, key management, and file-handling security have been reviewed.