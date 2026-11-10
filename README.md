 
# 🔐 CryptLock

### Your Private Vault. Your Files. Your Control.

**CryptLock** is a secure file-storage web application that allows users to upload, encrypt, store, preview, download, and manage their private files through a personal digital vault.

Files are encrypted using **AES-256-GCM** before being stored in MongoDB GridFS. The application also includes password-based authentication, vault-key protection, and a recovery-key mechanism designed to help users regain access without re-encrypting their existing files.

🌐 **Live Website:** https://cryptlock.vercel.app/

💻 **GitHub Repository:** https://github.com/0x64697679616d/CryptLock

---

## 📸 About the Project

CryptLock was developed to explore practical application security, cryptography, backend development, database integration, and full-stack application architecture.

Instead of simply uploading files to a database, CryptLock encrypts files before storage. The application separates file encryption from file management, using a C-based encryption engine connected to a Node.js backend.

The goal is to provide a simple interface while implementing important concepts such as:

- 🔒 File encryption and decryption
- 🔑 Password hashing and authentication
- 🛡️ AES-256-GCM authenticated encryption
- 🗄️ MongoDB database integration
- 📦 GridFS-based encrypted file storage
- ♻️ Recovery-key-based password recovery
- 📂 File and folder management

---

## ✨ Features

### 🔐 1. Secure User Authentication

- User registration and login.
- Password hashing using bcrypt.
- Session-based authentication.
- Protected vault routes.
- Individual user vaults.

Passwords are not stored as plain text.

### 🔒 2. AES-256-GCM File Encryption

CryptLock uses AES-256-GCM for file encryption.

AES-256-GCM provides:

- 256-bit encryption keys.
- Confidentiality of stored file contents.
- Authentication tags for integrity verification.
- Detection of unauthorized modifications to encrypted data.

The encryption and decryption operations are handled by a C-based backend engine.

### 🗝️ 3. Recovery Key System

CryptLock includes a recovery mechanism designed to help users regain access to their vault if they forget their password.

The recovery system:

- Generates a unique recovery key.
- Displays the recovery key during setup.
- Stores a SHA-256 hash for recovery-key verification.
- Protects the existing vault key using AES-256-GCM.
- Allows password reset using a valid recovery key.
- Preserves access to existing encrypted files after password reset.

**Important:** The recovery key must be generated and saved before the password is forgotten. Losing both the password and recovery key can result in permanent loss of access to the encrypted vault.

### 📁 4. File Management

Users can:

- Upload files to their vault.
- View stored files.
- Preview supported files.
- Download and decrypt files.
- Organize files into folders.
- Move files to trash.
- Restore deleted files.
- Permanently delete files.

### ☁️ 5. MongoDB GridFS Storage

CryptLock uses MongoDB GridFS to store encrypted file contents.

The database stores file metadata and encrypted file data separately.

This allows the application to manage file records while storing the actual encrypted file contents in GridFS.

### ⚡ 6. Global Loading Interface

The frontend includes a global loading interface for operations such as:

- Login and registration.
- File uploads.
- File retrieval.
- File previews.
- Downloads.
- Password recovery.
- Recovery-key setup.

The loading interface provides feedback while requests are being processed.

---

## 🏗️ System Architecture

CryptLock follows a multi-layer architecture.

```text
                 USER
                  |
                  v
          FRONTEND APPLICATION
           HTML / CSS / JS
                  |
                  v
           NODE.JS + EXPRESS
                  |
          Authentication
          Session Handling
          API Processing
                  |
                  v
          C ENCRYPTION ENGINE
             locker
                  |
          AES-256-GCM
          Encrypt / Decrypt
                  |
                  v
           MONGODB DATABASE
                  |
          +-------+-------+
          |               |
          v               v
      FILE METADATA    GRIDFS BUCKET
                      Encrypted Files
```

### Architecture Explanation

**1. Frontend**

The frontend is responsible for the user interface, authentication screens, file management, and communication with the backend APIs.

Technologies:
- HTML
- CSS
- JavaScript

**2. Node.js Backend**

The Node.js server handles:

- HTTP requests.
- User authentication.
- Session management.
- File upload and download workflows.
- MongoDB communication.
- Communication with the C encryption engine.

**3. C Encryption Engine**

The C backend handles the actual file encryption and decryption operations.

It uses AES-256-GCM and is invoked by the Node.js backend as a separate executable.

**4. MongoDB**

MongoDB stores user information and file metadata.

GridFS stores the encrypted file contents.

---

## 🔄 How File Encryption Works

The encryption workflow is designed so that the original file is encrypted before it is stored in GridFS.

```text
       USER SELECTS A FILE
                |
                v
         FILE UPLOAD REQUEST
                |
                v
         NODE.JS BACKEND
                |
                v
        TEMPORARY INPUT FILE
                |
                v
         C ENCRYPTION ENGINE
                |
                v
          AES-256-GCM
                |
                v
       ENCRYPTED OUTPUT FILE
                |
                v
          MONGODB GRIDFS
                |
                v
        ENCRYPTED FILE STORED
```

### Encryption Process

1. The user selects a file.
2. The frontend sends the file to the Node.js backend.
3. The backend invokes the C encryption executable.
4. The C program encrypts the file using AES-256-GCM.
5. The encrypted output is uploaded to MongoDB GridFS.
6. File metadata is stored in MongoDB.

The original file is not intentionally stored as plaintext in GridFS.

## 🔓 How File Decryption Works

When a user requests a file:

1. The backend verifies the user's authenticated session.
2. The encrypted file is retrieved from GridFS.
3. The encrypted data is temporarily written to disk.
4. The C encryption engine decrypts the file.
5. The decrypted output is returned for preview or download.
6. Temporary files are cleaned up.

```text
         USER REQUESTS FILE
                |
                v
          NODE.JS BACKEND
                |
                v
          MONGODB GRIDFS
                |
                v
         ENCRYPTED FILE
                |
                v
         C DECRYPTION ENGINE
                |
                v
           AES-256-GCM
                |
                v
          ORIGINAL FILE
                |
                v
         PREVIEW / DOWNLOAD
```

---

## 🗝️ Key Management and Password Recovery

CryptLock separates the user's login password from the encryption key used to protect the vault.

The password is processed using scrypt to derive a key. The vault key is protected using AES-256-GCM.

The recovery mechanism uses a separate recovery key to protect the existing vault key.

### Password Recovery Workflow

```text
         USER FORGETS PASSWORD
                  |
                  v
          ENTER RECOVERY KEY
                  |
                  v
        VERIFY RECOVERY KEY HASH
                  |
                  v
        UNLOCK EXISTING VAULT KEY
                  |
                  v
          SET NEW PASSWORD
                  |
                  v
        DERIVE NEW PASSWORD KEY
                  |
                  v
        PROTECT SAME VAULT KEY
                  |
                  v
           VAULT ACCESS RESTORED
```

Existing encrypted files do not need to be encrypted again when the password is reset.

**Recovery warning:** Recovery keys should be stored somewhere safe and separate from the application. Never share your recovery key or password.

---

## 🧰 Technology Stack

| Category | Technology |
|---|---|
| Frontend | HTML |
| Styling | CSS |
| Frontend Logic | JavaScript |
| Backend | Node.js |
| Backend Framework | Express.js |
| Encryption Language | C |
| Encryption Algorithm | AES-256-GCM |
| Password Hashing | bcrypt |
| Key Derivation | scrypt |
| Recovery Verification | SHA-256 |
| Database | MongoDB |
| File Storage | MongoDB GridFS |
| Authentication | Express Session |
| File Upload | Multer |
| Deployment | Render |
| Version Control | Git and GitHub |

---

## 📂 Project Structure

```text
CryptLock/
│
├── backend/
│   ├── main.c
│   ├── auth.c
│   ├── crypto.c
│   ├── locker.c
│   ├── catalog.c
│   ├── locker.h
│   └── build-linux.sh
│
├── server/
│   ├── server.js
│   ├── database.js
│   └── .env
│
├── public/
│   ├── index.html
│   ├── style.css
│   └── app.js
│
├── data/
│   └── files/
│
├── uploads/
│
├── temp/
│
├── package.json
├── package-lock.json
├── .gitignore
└── README.md
```

*Note: This shows the main application structure. Additional files may exist in the repository.*

---

## ⚙️ Installation and Local Setup

Follow these steps to run CryptLock locally.

### Prerequisites

Install the following:

- Node.js and npm
- Git
- MongoDB Atlas account or MongoDB connection
- GCC compiler
- OpenSSL development libraries
- Linux environment or WSL on Windows

### Step 1: Clone the Repository

```bash
git clone https://github.com/0x64697679616d/CryptLock.git
```

Move into the project directory:

```bash
cd CryptLock
```

### Step 2: Install Node.js Dependencies

```bash
npm install
```

### Step 3: Configure Environment Variables

Create a file named `.env` inside the `server` directory.

```env
PORT=3000
NODE_ENV=development

MONGODB_URI=your_mongodb_connection_string
MONGODB_DATABASE=locker

SESSION_SECRET=your_long_random_secret_at_least_32_characters
```

Replace the placeholder values with your own configuration.

**Never upload your `.env` file to GitHub.**

### Step 4: Build the C Encryption Engine

On Ubuntu or WSL, install the required build tools:

```bash
sudo apt update
sudo apt install build-essential libssl-dev
```

Build the Linux executable:

```bash
npm run build:locker
```

This runs the project's Linux build script and creates the `backend/locker` executable.

### Step 5: Start the Application

```bash
npm start
```

Open:

```text
http://localhost:3000
```

You should now be able to access CryptLock locally.

### Running on Windows

The C executable built by `build-linux.sh` is a Linux executable. It cannot be launched directly by Windows Node.js.

Use WSL to build and run the backend:

```powershell
wsl -d Ubuntu -- bash -lc "cd /mnt/c/Users/ACER-PC/OneDrive/Desktop/CryptLock && npm install && npm run build:locker && npm start"
```

Adjust the directory path if your project is stored somewhere else.

---

## ☁️ Deployment

CryptLock is deployed using Render.

🌐 **Production URL:** https://cryptlock.onrender.com

### Deployment Configuration

The application requires:

- A Linux environment.
- Node.js runtime.
- GCC compiler.
- OpenSSL development libraries.
- MongoDB connection.
- Required environment variables.

For a Render deployment using the Linux build script, configure:

**Build Command**

```bash
npm install && npm run build:locker
```

**Start Command**

```bash
npm start
```

Configure the environment variables in the Render dashboard rather than committing them to the repository.

### Free Hosting Note

The application currently uses Render's free web-service tier. Free instances can spin down after inactivity, which may cause the first request after a period of inactivity to take longer.

---

## 🔐 Security Considerations

CryptLock is designed around encryption and secure file handling, but security depends on the complete deployment and operational environment.

Important considerations:

- Use strong, unique passwords.
- Never share recovery keys.
- Keep environment variables private.
- Use HTTPS in production.
- Keep dependencies updated.
- Avoid storing plaintext files unnecessarily.
- Restrict access to temporary files.
- Protect MongoDB credentials.
- Use secure session configuration.

### Current Architecture Limitations

CryptLock is a learning and development project, and the following production-hardening work remains important:

- Replace the default in-memory Express session store with a persistent session store.
- Replace in-memory vault-key storage with a secure, scalable key-management approach.
- Add rate limiting to authentication and recovery endpoints.
- Review session invalidation and concurrent access across multiple instances.
- Review temporary-file permissions and cleanup behavior.
- Add automated security tests and deployment monitoring.
- Review backup and recovery procedures for database data.

Encryption alone does not guarantee that an entire application is secure. Authentication, authorization, key management, deployment, and storage must also be protected.

---

## 🧪 Testing

The project includes a cryptographic test command:

```bash
npm test
```

The test command compiles and runs the C cryptography test program using OpenSSL.

For the full application, also test:

- User registration.
- User login and logout.
- File upload and encryption.
- File listing.
- File preview.
- File download and decryption.
- File deletion and restoration.
- Recovery-key generation.
- Password recovery.
- Access isolation between users.

---

## 🚀 Future Improvements

Potential improvements for future versions include:

- [ ] Persistent session storage.
- [ ] Rate limiting and stronger authentication protections.
- [ ] Multi-factor authentication.
- [ ] Improved key-management architecture.
- [ ] File-sharing with controlled permissions.
- [ ] Storage usage dashboard.
- [ ] File integrity verification tests.
- [ ] Automated backup and restore workflows.
- [ ] Security audit and penetration testing.
- [ ] Improved monitoring and error reporting.
- [ ] More extensive automated test coverage.

---

## 🎯 Project Objectives

CryptLock was built to demonstrate practical implementation of:

1. Applied cryptography.
2. AES-256-GCM encryption and decryption.
3. C programming and file handling.
4. Node.js backend development.
5. REST API design.
6. MongoDB and GridFS integration.
7. Authentication and session management.
8. Secure key management.
9. Full-stack application development.
10. Deployment and version control.

---

CryptLock was developed collaboratively by a team of friends as a project focused on practical cryptography, secure file storage, and full-stack application development.

Team Members:

Divyam
GitHub: @0x64697679616d

Shouvik 
GitHub: shouvikd48-cmyk

Bablu
GitHub: Bablu-kumar-dev

Each contributor collaborated on the development and implementation of CryptLock.

Project Repository: https://github.com/0x64697679616d/CryptLock

Live Website: https://cryptlock.onrender.com

---

## 📜 License

No license has been specified for this repository yet.

Unless a license is added, the default copyright rules apply. You should not assume that others have permission to redistribute or modify this project.

---

## ⭐ Support the Project

If you find CryptLock interesting:

- ⭐ Star the GitHub repository.
- 🍴 Fork the repository.
- 🐛 Report bugs or suggest improvements.
- 💡 Contribute ideas for future features.

**CryptLock: Security starts with how you protect your data. 🔐**
