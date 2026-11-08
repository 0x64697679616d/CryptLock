#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>

#include <openssl/evp.h>
#include <openssl/rand.h>

#define KEY_SIZE 32
#define NONCE_SIZE 12
#define TAG_SIZE 16
#define BUFFER_SIZE 16384
#define HEADER_SIZE (8 + NONCE_SIZE + TAG_SIZE)

static const unsigned char MAGIC[8] = {
    'C', 'L', 'C', 'K', 'G', 'C', 'M', '1'
};

/*
 * Return 1 on success and 0 on failure.
 * The key must contain exactly 32 bytes.
 *
 * Encrypted file format:
 *   8-byte magic | 12-byte nonce | 16-byte tag | ciphertext
 */

static int writeAll(FILE *file, const unsigned char *data, size_t length)
{
    return fwrite(data, 1, length, file) == length;
}

static int readExact(FILE *file, unsigned char *data, size_t length)
{
    return fread(data, 1, length, file) == length;
}

static char *makeTempPath(const char *outputPath)
{
    size_t length = strlen(outputPath);
    char *tempPath;

    if (length > SIZE_MAX - 5) {
        return NULL;
    }

    tempPath = malloc(length + 5);
    if (tempPath == NULL) {
        return NULL;
    }

    memcpy(tempPath, outputPath, length);
    memcpy(tempPath + length, ".tmp", 5);

    return tempPath;
}

int encryptFile(
    const char *inputPath,
    const char *outputPath,
    const unsigned char key[KEY_SIZE])
{
    FILE *input = NULL;
    FILE *output = NULL;
    EVP_CIPHER_CTX *ctx = NULL;

    unsigned char nonce[NONCE_SIZE];
    unsigned char tag[TAG_SIZE];
    unsigned char inBuffer[BUFFER_SIZE];
    unsigned char outBuffer[BUFFER_SIZE + EVP_MAX_BLOCK_LENGTH];

    int outLength;
    int ok = 0;
    size_t bytesRead;

    if (inputPath == NULL || outputPath == NULL || key == NULL ||
        inputPath[0] == '\0' || outputPath[0] == '\0') {
        return 0;
    }

    input = fopen(inputPath, "rb");
    if (input == NULL) {
        goto cleanup;
    }

    /* Exclusive creation prevents overwriting an existing output. */
    output = fopen(outputPath, "wbx");
    if (output == NULL) {
        goto cleanup;
    }

    if (RAND_bytes(nonce, sizeof nonce) != 1) {
        goto cleanup;
    }

    ctx = EVP_CIPHER_CTX_new();
    if (ctx == NULL) {
        goto cleanup;
    }

    if (EVP_EncryptInit_ex(ctx, EVP_aes_256_gcm(), NULL, NULL, NULL) != 1 ||
        EVP_CIPHER_CTX_ctrl(ctx, EVP_CTRL_GCM_SET_IVLEN,
                            NONCE_SIZE, NULL) != 1 ||
        EVP_EncryptInit_ex(ctx, NULL, NULL, key, nonce) != 1) {
        goto cleanup;
    }

    /* Write header; the authentication tag is filled in later. */
    if (!writeAll(output, MAGIC, sizeof MAGIC) ||
        !writeAll(output, nonce, sizeof nonce)) {
        goto cleanup;
    }

    memset(tag, 0, sizeof tag);
    if (!writeAll(output, tag, sizeof tag)) {
        goto cleanup;
    }

    while ((bytesRead = fread(inBuffer, 1, sizeof inBuffer, input)) > 0) {
        if (EVP_EncryptUpdate(ctx, outBuffer, &outLength,
                              inBuffer, (int)bytesRead) != 1 ||
            !writeAll(output, outBuffer, (size_t)outLength)) {
            goto cleanup;
        }
    }

    if (ferror(input)) {
        goto cleanup;
    }

    if (EVP_EncryptFinal_ex(ctx, outBuffer, &outLength) != 1 ||
        !writeAll(output, outBuffer, (size_t)outLength) ||
        EVP_CIPHER_CTX_ctrl(ctx, EVP_CTRL_GCM_GET_TAG,
                            TAG_SIZE, tag) != 1) {
        goto cleanup;
    }

    /* Header layout: magic (8), nonce (12), tag (16). */
    if (fseek(output, 8 + NONCE_SIZE, SEEK_SET) != 0 ||
        !writeAll(output, tag, sizeof tag)) {
        goto cleanup;
    }

    if (fflush(output) != 0) {
        goto cleanup;
    }

    ok = 1;

cleanup:
    if (input != NULL && fclose(input) != 0) {
        ok = 0;
    }

    if (output != NULL && fclose(output) != 0) {
        ok = 0;
    }

    EVP_CIPHER_CTX_free(ctx);

    if (!ok && outputPath != NULL) {
        remove(outputPath);
    }

    return ok;
}

int decryptFile(
    const char *inputPath,
    const char *outputPath,
    const unsigned char key[KEY_SIZE])
{
    FILE *input = NULL;
    FILE *output = NULL;
    EVP_CIPHER_CTX *ctx = NULL;
    char *tempPath = NULL;

    unsigned char magic[sizeof MAGIC];
    unsigned char nonce[NONCE_SIZE];
    unsigned char tag[TAG_SIZE];
    unsigned char inBuffer[BUFFER_SIZE];
    unsigned char outBuffer[BUFFER_SIZE + EVP_MAX_BLOCK_LENGTH];

    int outLength;
    int ok = 0;
    int authenticated = 0;
    size_t bytesRead;

    if (inputPath == NULL || outputPath == NULL || key == NULL ||
        inputPath[0] == '\0' || outputPath[0] == '\0') {
        return 0;
    }

    input = fopen(inputPath, "rb");
    if (input == NULL) {
        goto cleanup;
    }

    if (!readExact(input, magic, sizeof magic) ||
        memcmp(magic, MAGIC, sizeof MAGIC) != 0 ||
        !readExact(input, nonce, sizeof nonce) ||
        !readExact(input, tag, sizeof tag)) {
        goto cleanup;
    }

    tempPath = makeTempPath(outputPath);
    if (tempPath == NULL) {
        goto cleanup;
    }

    /*
     * Write decrypted bytes to a temporary file.
     * Do not publish them as the final output until the tag verifies.
     */
    output = fopen(tempPath, "wbx");
    if (output == NULL) {
        goto cleanup;
    }

    ctx = EVP_CIPHER_CTX_new();
    if (ctx == NULL) {
        goto cleanup;
    }

    if (EVP_DecryptInit_ex(ctx, EVP_aes_256_gcm(), NULL, NULL, NULL) != 1 ||
        EVP_CIPHER_CTX_ctrl(ctx, EVP_CTRL_GCM_SET_IVLEN,
                            NONCE_SIZE, NULL) != 1 ||
        EVP_DecryptInit_ex(ctx, NULL, NULL, key, nonce) != 1) {
        goto cleanup;
    }

    while ((bytesRead = fread(inBuffer, 1, sizeof inBuffer, input)) > 0) {
        if (EVP_DecryptUpdate(ctx, outBuffer, &outLength,
                              inBuffer, (int)bytesRead) != 1 ||
            !writeAll(output, outBuffer, (size_t)outLength)) {
            goto cleanup;
        }
    }

    if (ferror(input)) {
        goto cleanup;
    }

    if (EVP_CIPHER_CTX_ctrl(ctx, EVP_CTRL_GCM_SET_TAG,
                            TAG_SIZE, tag) != 1) {
        goto cleanup;
    }

    /* Fails if the key is wrong or the encrypted data was modified. */
    if (EVP_DecryptFinal_ex(ctx, outBuffer, &outLength) != 1) {
        goto cleanup;
    }

    if (!writeAll(output, outBuffer, (size_t)outLength) ||
        fflush(output) != 0) {
        goto cleanup;
    }

    authenticated = 1;
    ok = 1;

cleanup:
    if (input != NULL && fclose(input) != 0) {
        ok = 0;
    }

    if (output != NULL && fclose(output) != 0) {
        ok = 0;
    }

    EVP_CIPHER_CTX_free(ctx);

    if (ok && authenticated) {
        /*
         * rename normally fails if the destination already exists
         * on Windows. The final file is not published before
         * successful authentication.
         */
        if (rename(tempPath, outputPath) != 0) {
            ok = 0;
        }
    }

    if (!ok && tempPath != NULL) {
        remove(tempPath);
    }

    free(tempPath);
    return ok;
}

