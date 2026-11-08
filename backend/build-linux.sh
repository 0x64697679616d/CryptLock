#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p backend data/files uploads temp
# crypto.c is the existing, tested AES-256-GCM implementation.
gcc -std=c11 -O2 -Wall -Wextra -Wpedantic backend/main.c backend/crypto.c -lcrypto -o backend/locker
chmod 700 backend/locker
printf 'Built backend/locker successfully.\n'
