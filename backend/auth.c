
#include <stdint.h>

uint64_t hashPassword(const char *password)
{
    uint64_t hash = 5381;

    while (*password != '\0')
    {
        hash = hash * 33 + (unsigned char)*password;
        password++;
    }

    return hash;
}
