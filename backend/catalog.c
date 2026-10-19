
#include <stddef.h>
#include <string.h>

/* Record of one stored file. */
typedef struct {
    char id[25];
    char owner[50];
    char name[50];
    char lockedPath[120];
    long size;
    char date[20];
} Entry;

/* Friend B's MongoDB lookup function. */
int getEntryById(const char *id, Entry *e);

/* Public interface for the retrieval module. */
int getFileDetails(
    const char *fileid,
    char *owner,
    size_t ownerSize,
    char *lockedPath,
    size_t pathSize
)
{
    if (fileid == NULL || fileid[0] == '\0' ||
        owner == NULL || ownerSize == 0 ||
        lockedPath == NULL || pathSize == 0)
    {
        return 0;
    }

    Entry entry;

    if (getEntryById(fileid, &entry) != 1)
    {
        return 0;
    }

    size_t ownerLength = strlen(entry.owner);
    size_t pathLength = strlen(entry.lockedPath);

    if (ownerLength >= ownerSize || pathLength >= pathSize)
    {
        return 0;
    }

    memcpy(owner, entry.owner, ownerLength + 1);
    memcpy(lockedPath, entry.lockedPath, pathLength + 1);

    return 1;
}
