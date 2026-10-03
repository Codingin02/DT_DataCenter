#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

enum { INMP441_BLOCK_FRAMES = 480, INMP441_FRAME_BYTES = 6 };

bool inmp441_extract_left(const uint8_t *frames, size_t byte_count,
                          int32_t *samples, size_t capacity);
