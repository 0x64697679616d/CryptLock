
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef struct {
    char id[37];
    char owner[50];
    char name[50];
    char lockedName[50];
    long size;
    char date[20];
} Entry;


int appendEntry(const Entry *e) {
    if (e == NULL) {
        return 0;
    }

    FILE *fp = fopen("catalog.txt", "a");

    if (fp == NULL) {
        return 0;
    }

    int result = fprintf(fp, "%s|%s|%s|%s|%ld|%s\n",
                         e->id,
                         e->owner,
                         e->name,
                         e->lockedName,
                         e->size,
                         e->date);

    if (fclose(fp) != 0) {
        return 0;
    }

    return result >= 0;
}

int countEntries(void) {
    FILE *fp = fopen("catalog.txt", "r");

    if (fp == NULL) {
        return 0;
    }

    int count = 0;
    char line[256];

    while (fgets(line, sizeof(line), fp) != NULL) {
        count++;
    }

    fclose(fp);
    return count;
}


int getEntry(int index, Entry *e) {
    if (index < 0 || e == NULL) {
        return 0;
    }

    FILE *fp = fopen("catalog.txt", "r");

    if (fp == NULL) {
        return 0;
    }

    char line[256];
    int current = 0;

    while (fgets(line, sizeof(line), fp) != NULL) {
        if (current == index) {
            int fields = sscanf(
                line,
                "%36[^|]|%49[^|]|%49[^|]|%49[^|]|%ld|%19[^\n]",
                e->id,
                e->owner,
                e->name,
                e->lockedName,
                &e->size,
                e->date
            );

            fclose(fp);
            return fields == 6;
        }

        current++;
    }

    fclose(fp);
    return 0;
}

int getEntryById(const char *id, const char *owner, Entry *e) {
    if (id == NULL || id[0] == '\0' ||
        owner == NULL || owner[0] == '\0' ||
        e == NULL) {
        return 0;
    }

    FILE *fp = fopen("catalog.txt", "r");

    if (fp == NULL) {
        return 0;
    }

    char line[256];
    Entry current;

    while (fgets(line, sizeof(line), fp) != NULL) {
        int fields = sscanf(
            line,
            "%36[^|]|%49[^|]|%49[^|]|%49[^|]|%ld|%19[^\n]",
            current.id,
            current.owner,
            current.name,
            current.lockedName,
            &current.size,
            current.date
        );

        if (fields == 6 &&
            strcmp(current.id, id) == 0 &&
            strcmp(current.owner, owner) == 0) {
            *e = current;
            fclose(fp);
            return 1;
        }
    }

    fclose(fp);
    return 0;
}


int listFiles(void) {
    FILE *fp = fopen("catalog.txt", "r");

    if (fp == NULL) {
        printf("No files found.\n");
        return 0;
    }

    char line[256];
    int index = 0;
    Entry e;

    printf("\n--- Digital Locker Files ---\n");

    while (fgets(line, sizeof(line), fp) != NULL) {
        int fields = sscanf(
            line,
            "%36[^|]|%49[^|]|%49[^|]|%49[^|]|%ld|%19[^\n]",
            e.id,
            e.owner,
            e.name,
            e.lockedName,
            &e.size,
            e.date
        );

        if (fields == 6) {
            printf("%d. %s | %ld bytes | %s\n",
                   index, e.name, e.size, e.date);
            index++;
        }
    }

    fclose(fp);

    if (index == 0) {
        printf("No files found.\n");
    }

    return index;
}

int deleteFile(int index) {
    if (index < 0) {
        return 0;
    }

    int total = countEntries();

    if (index >= total) {
        return 0;
    }

    FILE *fp = fopen("catalog.txt", "r");

    if (fp == NULL) {
        return 0;
    }

    FILE *temp = fopen("catalog_temp.txt", "w");

    if (temp == NULL) {
        fclose(fp);
        return 0;
    }

    char line[256];
    int current = 0;

    while (fgets(line, sizeof(line), fp) != NULL) {
        if (current != index) {
            fputs(line, temp);
        }
        current++;
    }

    fclose(fp);
    fclose(temp);

    if (remove("catalog.txt") != 0) {
        return 0;
    }

    if (rename("catalog_temp.txt", "catalog.txt") != 0) {
        return 0;
    }

    return 1;
}
