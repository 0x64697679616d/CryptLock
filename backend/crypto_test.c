#include <stdio.h>
#include <stdlib.h>
#include <string.h>

extern int encryptFile(
    const char *inputPath,
    const char *outputPath,
    const unsigned char key[32]
);

extern int decryptFile(
    const char *inputPath,
    const char *outputPath,
    const unsigned char key[32]
);

static const unsigned char key[32] = {
    [0 ... 31] = 0x42
};

static const unsigned char wrongKey[32] = {
    [0 ... 31] = 0x19
};

static int writePattern(const char *path, size_t size)
{
    FILE *f = fopen(path, "wb");
    unsigned char buffer[16384];
    size_t written = 0;

    if (!f) return 0;

    while (written < size) {
        size_t n = size - written;
        if (n > sizeof buffer) n = sizeof buffer;

        for (size_t i = 0; i < n; i++)
            buffer[i] = (unsigned char)((written + i) * 31 + (written + i) / 7);

        if (fwrite(buffer, 1, n, f) != n) {
            fclose(f);
            return 0;
        }
        written += n;
    }

    return fclose(f) == 0;
}

static int filesEqual(const char *a, const char *b)
{
    FILE *fa = fopen(a, "rb");
    FILE *fb = fopen(b, "rb");
    int x, y;

    if (!fa || !fb) {
        if (fa) fclose(fa);
        if (fb) fclose(fb);
        return 0;
    }

    do {
        x = fgetc(fa);
        y = fgetc(fb);
        if (x != y) {
            fclose(fa);
            fclose(fb);
            return 0;
        }
    } while (x != EOF);

    fclose(fa);
    fclose(fb);
    return y == EOF;
}

static void clean(const char *path)
{
    remove(path);
}

static int roundTrip(const char *name, size_t size)
{
    char input[128], encrypted[128], decrypted[128];

    snprintf(input, sizeof input, "backend/test_%s_input.bin", name);
    snprintf(encrypted, sizeof encrypted, "backend/test_%s_encrypted.bin", name);
    snprintf(decrypted, sizeof decrypted, "backend/test_%s_decrypted.bin", name);

    clean(input);
    clean(encrypted);
    clean(decrypted);

    if (!writePattern(input, size)) return 0;
    if (!encryptFile(input, encrypted, key)) return 0;
    if (!decryptFile(encrypted, decrypted, key)) return 0;

    int passed = filesEqual(input, decrypted);

    clean(input);
    clean(encrypted);
    clean(decrypted);

    return passed;
}

static int wrongKeyTest(void)
{
    const char *input = "backend/test_wrong_input.bin";
    const char *encrypted = "backend/test_wrong_encrypted.bin";
    const char *output = "backend/test_wrong_output.bin";
    const char *temp = "backend/test_wrong_output.bin.tmp";

    clean(input); clean(encrypted); clean(output); clean(temp);

    if (!writePattern(input, 1024)) return 0;
    if (!encryptFile(input, encrypted, key)) return 0;

    int rejected = !decryptFile(encrypted, output, wrongKey);
    int noOutput = fopen(output, "rb") == NULL;
    int noTemp = fopen(temp, "rb") == NULL;

    clean(input); clean(encrypted); clean(output); clean(temp);
    return rejected && noOutput && noTemp;
}

static int tamperTest(void)
{
    const char *input = "backend/test_tamper_input.bin";
    const char *encrypted = "backend/test_tamper_encrypted.bin";
    const char *output = "backend/test_tamper_output.bin";
    const char *temp = "backend/test_tamper_output.bin.tmp";

    clean(input); clean(encrypted); clean(output); clean(temp);

    if (!writePattern(input, 1024)) return 0;
    if (!encryptFile(input, encrypted, key)) return 0;

    FILE *f = fopen(encrypted, "r+b");
    if (!f) return 0;

    /* Modify a ciphertext byte after the 36-byte header. */
    if (fseek(f, 40, SEEK_SET) != 0) {
        fclose(f);
        return 0;
    }

    int c = fgetc(f);
    if (c == EOF || fseek(f, 40, SEEK_SET) != 0) {
        fclose(f);
        return 0;
    }

    fputc(c ^ 0x01, f);
    fclose(f);

    int rejected = !decryptFile(encrypted, output, key);
    int noOutput = fopen(output, "rb") == NULL;
    int noTemp = fopen(temp, "rb") == NULL;

    clean(input); clean(encrypted); clean(output); clean(temp);
    return rejected && noOutput && noTemp;
}

int main(void)
{
    int failures = 0;

    printf("\nCryptLock AES-256-GCM Security Test Suite\n\n");

#define RUN_TEST(label, expression) do { \
    printf("%-35s", label); \
    if (expression) printf("PASS\n"); \
    else { printf("FAIL\n"); failures++; } \
} while (0)

    RUN_TEST("Normal encryption/decryption", roundTrip("normal", 128));
    RUN_TEST("Empty file", roundTrip("empty", 0));
    RUN_TEST("Binary file", roundTrip("binary", 1024));
    RUN_TEST("20 MB large file", roundTrip("large", 20 * 1024 * 1024));
    RUN_TEST("Wrong key rejection", wrongKeyTest());
    RUN_TEST("Ciphertext tampering rejection", tamperTest());

    printf("\n-------------------------------\n");
    printf("Tests passed: %d/6\n", 6 - failures);
    printf("Tests failed: %d/6\n", failures);

    return failures ? 1 : 0;
}
