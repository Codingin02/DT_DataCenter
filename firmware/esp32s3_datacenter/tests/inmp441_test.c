#include "inmp441_samples.h"

#define CHECK(condition) do { if (!(condition)) return __LINE__; } while (0)

int main(void)
{
    const uint8_t synthetic_frames[] = {
        0x00, 0x00, 0x00, 0xFF, 0xFF, 0x7F,
        0xFF, 0xFF, 0x7F, 0x00, 0x00, 0x80,
        0x00, 0x00, 0x80, 0x01, 0x00, 0x00,
        0xFF, 0xFF, 0xFF, 0x00, 0x00, 0x00,
        0x01, 0x00, 0x00, 0xFF, 0xFF, 0xFF,
        0x56, 0x34, 0x12, 0x00, 0x00, 0x80,
        0xBA, 0xDC, 0xFE, 0xFF, 0xFF, 0x7F,
        0xFE, 0xFF, 0x7F, 0xFF, 0xFF, 0xFF,
        0x01, 0x00, 0x80, 0x00, 0x00, 0x00,
    };
    const int32_t expected[] = {
        0, 8388607, -8388608, -1, 1, 0x123456, -74566, 8388606, -8388607,
    };
    int32_t samples[9];
    uint8_t frames[sizeof(synthetic_frames)];
    for (size_t i = 0; i < sizeof(frames); ++i) {
        frames[i] = synthetic_frames[i];
    }
    for (unsigned repeat = 0; repeat < 2; ++repeat) {
        CHECK(inmp441_extract_left(frames, sizeof(frames), samples, 9));
        for (size_t i = 0; i < 9; ++i) {
            CHECK(samples[i] == expected[i]);
        }
        for (size_t i = 0; i < sizeof(frames); ++i) {
            CHECK(frames[i] == synthetic_frames[i]);
        }
    }
    for (size_t i = 0; i < 9; ++i) {
        frames[i * INMP441_FRAME_BYTES + 3] ^= 0xFF;
        frames[i * INMP441_FRAME_BYTES + 4] ^= 0xFF;
        frames[i * INMP441_FRAME_BYTES + 5] ^= 0xFF;
    }
    CHECK(inmp441_extract_left(frames, sizeof(frames), samples, 9));
    for (size_t i = 0; i < 9; ++i) {
        CHECK(samples[i] == expected[i]);
    }

    CHECK(!inmp441_extract_left(NULL, 6, samples, 9));
    CHECK(!inmp441_extract_left(frames, 6, NULL, 9));
    CHECK(!inmp441_extract_left(frames, 0, samples, 9));
    CHECK(!inmp441_extract_left(frames, 5, samples, 9));
    CHECK(!inmp441_extract_left(frames, 7, samples, 9));
    CHECK(!inmp441_extract_left(frames, sizeof(frames), samples, 8));
    CHECK(!inmp441_extract_left(frames,
                               (INMP441_BLOCK_FRAMES + 1) * INMP441_FRAME_BYTES,
                               samples, INMP441_BLOCK_FRAMES + 1));
    for (size_t i = 0; i < 9; ++i) {
        CHECK(samples[i] == expected[i]);
    }

    uint8_t block[INMP441_BLOCK_FRAMES * INMP441_FRAME_BYTES];
    int32_t output[INMP441_BLOCK_FRAMES];
    for (size_t i = 0; i < sizeof(block); ++i) {
        block[i] = synthetic_frames[i % sizeof(synthetic_frames)];
    }
    CHECK(inmp441_extract_left(block, sizeof(block), output, INMP441_BLOCK_FRAMES));
    for (size_t i = 0; i < INMP441_BLOCK_FRAMES; ++i) {
        CHECK(output[i] == expected[i % 9]);
    }

    for (uint32_t word = 0; word <= 0xFFFFFFU; ++word) {
        const uint8_t frame[] = {
            (uint8_t)word, (uint8_t)(word >> 8U), (uint8_t)(word >> 16U), 0, 0, 0,
        };
        CHECK(inmp441_extract_left(frame, sizeof(frame), output, 1));
        CHECK(output[0] >= -8388608 && output[0] <= 8388607);
        CHECK(((uint32_t)output[0] & 0xFFFFFFU) == word);
        CHECK((output[0] < 0) == ((word & 0x800000U) != 0));
    }
    return 0;
}
