#include <stdio.h>
#include <stdlib.h>
#include <string.h>

int retrieveFile(
    const char *fileid,
    const char *username,
    const char *destinationPath
) {
    if (fileid == NULL || fileid[0] == '\0' ||
        username == NULL || username[0] == '\0' ||
        destinationPath == NULL || destinationPath[0] == '\0') {
        return 1;
    }

    return 0;
}

static int isValidStoredName(const char *name)
{
    if (name == NULL || name[0] == '\0') {
        return 0;
    }

    /* Reject hidden names and path traversal. */
    if (name[0] == '.' ||
        strchr(name, '/') != NULL ||
        strchr(name, '\\') != NULL) {
        return 0;
    }

    /* Allow letters, digits, dot, underscore and hyphen. */
    for (int i = 0; name[i] != '\0'; i++) {
        char c = name[i];

        if (!((c >= 'a' && c <= 'z') ||
              (c >= 'A' && c <= 'Z') ||
              (c >= '0' && c <= '9') ||
              c == '.' || c == '_' || c == '-')) {
            return 0;
        }
    }

    return 1;
}

int lockFile(const char *sourcePath, const char *storedName)
{
    if (sourcePath == NULL || sourcePath[0] == '\0' ||
        !isValidStoredName(storedName)) {
        return 1;
    }

    char destinationPath[512];

    int length = snprintf(destinationPath, sizeof(destinationPath),
                          "data/files/%s", storedName);

    if (length < 0 || (size_t)length >= sizeof(destinationPath)) {
        return 1;
    }

    FILE *source = fopen(sourcePath, "rb");
    if (source == NULL) {
        return 1;
    }

    /* Exclusive creation: do not overwrite an existing file. */
    FILE *destination = fopen(destinationPath, "wbx");
    if (destination == NULL) {
        fclose(source);
        return 1;
    }

    int ch;
    int failed = 0;

    while ((ch = fgetc(source)) != EOF) {
        if (fputc(ch, destination) == EOF) {
            failed = 1;
            break;
        }
    }

    if (ferror(source)) {
        failed = 1;
    }

    if (fclose(source) != 0) {
        failed = 1;
    }

    if (fclose(destination) != 0) {
        failed = 1;
    }

    if (failed) {
        remove(destinationPath);
        return 1;
    }

    return 0;
}
