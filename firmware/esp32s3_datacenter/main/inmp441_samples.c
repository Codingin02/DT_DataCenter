#include "inmp441_samples.h"

bool inmp441_extract_left(const uint8_t *frames, size_t byte_count,
                          int32_t *samples, size_t capacity)
{
    if (frames == NULL || samples == NULL || byte_count == 0 ||
        byte_count % INMP441_FRAME_BYTES != 0 ||
        byte_count > INMP441_BLOCK_FRAMES * INMP441_FRAME_BYTES ||
        capacity < byte_count / INMP441_FRAME_BYTES) {
        return false;
    }

    /* ESP32-S3 24-bit stereo RX packs each slot into three little-endian bytes. */
    for (size_t i = 0; i < byte_count / INMP441_FRAME_BYTES; ++i) {
        const uint8_t *left = frames + i * INMP441_FRAME_BYTES;
        const uint32_t word = (uint32_t)left[0] |
            ((uint32_t)left[1] << 8U) | ((uint32_t)left[2] << 16U);
        samples[i] = (int32_t)(word & 0x7FFFFFU) - (int32_t)(word & 0x800000U);
    }
    return true;
}
