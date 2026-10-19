#include <stdio.h>

int retrieveFile(
    const char *fileid,
    const char *username,
    const char *destinationPath
) {
    
    if(fileid == NULL || fileid[0] == '\0' || username == NULL || username[0] == '\0' || destinationPath == NULL || destinationPath[0] == '\0'){
        return 1;
    }

    return 0;
}