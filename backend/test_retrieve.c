#include <stdio.h>
#include <string.h>

typedef struct {
    char id[37];
    char owner[50];
    char name[50];
    char lockedName[50];
    long size;
    char date[20];
} Entry;

int appendEntry(const Entry *e);

int retrieveFile(
    const char *fileid,
    const char *username,
    const char *destinationPath
);

int main(void)
{
    Entry e = {
        "test-file-001",
        "alice",
        "sample.bin",
        "test-stored.bin",
        4,
        "2026-10-21"
    };

    if (!appendEntry(&e)) {
        printf("Could not write test catalog entry.\n");
        return 1;
    }

    printf("Test 1: Correct owner\n");
    int ownerResult = retrieveFile(
        "test-file-001",
        "alice",
        "data/retrieved_test.bin"
    );
    printf("Result: %s\n", ownerResult == 0 ? "PASS" : "FAIL");

    printf("Test 2: Wrong owner\n");
    int wrongOwnerResult = retrieveFile(
        "test-file-001",
        "bob",
        "data/retrieved_wrong.bin"
    );
    printf("Result: %s\n", wrongOwnerResult != 0 ? "PASS" : "FAIL");

    return 0;
}