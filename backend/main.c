#include <stdio.h>
#include <string.h>
#include <openssl/crypto.h>

#define KEY_SIZE 32

int encryptFile(const char *inputPath, const char *outputPath,
                const unsigned char key[KEY_SIZE]);
int decryptFile(const char *inputPath, const char *outputPath,
                const unsigned char key[KEY_SIZE]);

int main(int argc, char **argv) {
    unsigned char key[KEY_SIZE];
    int result;

    if (argc != 4 ||
        (strcmp(argv[1], "encrypt") != 0 && strcmp(argv[1], "decrypt") != 0)) {
        fprintf(stderr, "Usage: locker <encrypt|decrypt> <input> <output>\n");
        return 2;
    }

    if (fread(key, 1, KEY_SIZE, stdin) != KEY_SIZE) {
        fprintf(stderr, "Failed to read encryption key from stdin.\n");
        OPENSSL_cleanse(key, sizeof(key));
        return 3;
    }

    if (strcmp(argv[1], "encrypt") == 0) {
        result = encryptFile(argv[2], argv[3], key);
    } else {
        result = decryptFile(argv[2], argv[3], key);
    }

    OPENSSL_cleanse(key, sizeof(key));
    if (result != 1) {
        fprintf(stderr, "CryptLock operation failed.\n");
        return 1;
    }

    puts("OK");
    return 0;
}
