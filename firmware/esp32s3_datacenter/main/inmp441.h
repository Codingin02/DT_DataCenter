#pragma once

#include "esp_err.h"

/* Called once at startup; the acquisition task exclusively owns RX afterwards. */
esp_err_t inmp441_start(void);
