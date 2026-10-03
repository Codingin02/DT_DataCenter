#pragma once
/* MinGW lacks gmtime_r; wrap gmtime which is adequate for single-threaded host tests. */
#ifndef _WIN32
#error "host_compat/time.h is only for MinGW host builds"
#endif
#include_next <time.h>
#ifndef gmtime_r
static inline struct tm *gmtime_r(const time_t *timep, struct tm *result)
{
    struct tm *gm = gmtime(timep);
    if (gm == NULL) return NULL;
    *result = *gm;
    return result;
}
#endif
