# Hardware bring-up checklist

Sequential verification for the ESP32-S3 + SEN0331 + INMP441 hardware.
Do not connect all hardware at once. Follow each step in order.

## Prerequisites

- ESP-IDF 5.5.5 installed and verified
- Firmware builds successfully (`idf.py build`)
- Multimeter available
- Oscilloscope or logic analyzer available

## Inspection

- [ ] 1. Visual inspection of ESP32-S3 development board
  - Verify module marking: ESP32-S3-WROOM-1-N16R8
  - STOP if module does not match target
- [ ] 2. Visual inspection of SEN0331 A and SEN0331 B
  - Verify DFRobot Fermion SHT31 / SEN0331 markings
  - Note address-selection pin state (ADDR to GND or VDD)
- [ ] 3. Visual inspection of INMP441 breakout
  - Verify pin labels: VDD, GND, WS, SCK/BCLK, SD/DOUT, L/R
  - Verify L/R tied to GND (left channel)

## Power (no sensors connected)

- [ ] 4. Continuity/short-circuit checks with power OFF
  - Check 5V/3V3/GND rails for shorts
  - STOP if short circuit detected
- [ ] 5. Apply 5V to development board via USB
  - Verify 5V input: 4.75–5.25V
  - STOP if voltage outside range
- [ ] 6. Verify 3.3V rail
  - Measure 3V3 pin: 3.2–3.4V
  - STOP if voltage outside range or board overheating

## SEN0331 A (I2C0)

- [ ] 7. Connect SEN0331 A only
  - SDA → GPIO8
  - SCL → GPIO9
  - VCC → 3.3V
  - GND → GND
- [ ] 8. Flash firmware
- [ ] 9. Verify I2C0 detection
  - Monitor serial output for `sensor_a SHT31 ready at 0x44` or `0x45`
  - STOP if no I2C ACK (check wiring, pullups, address selection)
- [ ] 10. Verify CRC-valid temperature/humidity data
  - Observe successful measurement log entries
  - STOP if persistent CRC failures (check signal integrity)

## SEN0331 B (I2C1)

- [ ] 11. Connect SEN0331 B
  - SDA → GPIO10
  - SCL → GPIO11
  - VCC → 3.3V
  - GND → GND
- [ ] 12. Verify independent I2C1 detection
  - Monitor serial output for `sensor_b SHT31 ready at 0x44` or `0x45`
  - Verify both sensors report independently
  - STOP if no I2C ACK or bus conflict

## INMP441 (I2S0)

- [ ] 13. Connect INMP441
  - WS → GPIO4
  - BCLK/SCK → GPIO5
  - SD/DOUT → GPIO6
  - L/R → GND
  - VDD → 3.3V
  - GND → GND
- [ ] 14. Verify WS frequency
  - Measure WS pin with oscilloscope
  - Expected: ~48 kHz
  - STOP if frequency incorrect (check I2S configuration)
- [ ] 15. Verify BCLK frequency
  - Measure BCLK pin with oscilloscope
  - Expected: ~3.072 MHz (48000 × 64)
  - STOP if frequency incorrect
- [ ] 16. Verify PCM activity
  - Monitor serial output for acoustic window completions
  - STOP if DMA overrun or no PCM data
- [ ] 17. Verify RMS/Peak calculation
  - Observe non-zero dBFS values in acoustic results
  - Verify ambient noise produces reasonable readings
  - STOP if values are always zero or always -inf

## Connectivity

- [ ] 18. Configure Wi-Fi credentials via menuconfig
- [ ] 19. Enable Wi-Fi
  - Monitor serial output for "Wi-Fi IP ready"
  - STOP if persistent connection failure
- [ ] 20. Connect MQTT QoS 1
  - Monitor serial output for "MQTT connected"
  - Verify device status topic published
  - STOP if MQTT identity/schema mismatch

## End-to-end verification

- [ ] 21. Verify backend ingestion
  - Check Node.js backend logs for accepted measurements
  - STOP if persistent rejections (check identity registration)
- [ ] 22. Verify PostgreSQL current/history
  - Query `digital_twin.current_state` for production asset_ids
  - Verify measurements appear in `digital_twin.measurements`
- [ ] 23. Verify SSE/frontend
  - Connect to `/api/current-state/events`
  - Verify live updates appear
- [ ] 24. Compare against golden test vectors
  - Place sensors in controlled environment
  - Verify readings within tolerance of golden vectors
- [ ] 25. Begin physical-to-virtual synchronization measurements

## Stop conditions

| Condition                   | Action                                   |
| --------------------------- | ---------------------------------------- |
| Wrong supply voltage        | Remove power immediately                 |
| Short circuit               | Do not apply power until resolved        |
| Board or sensor overheating | Remove power, inspect wiring             |
| No I2C ACK                  | Check wiring, pullups, address selection |
| Persistent CRC failures     | Check signal integrity, bus speed        |
| Incorrect I2S clocks        | Check GPIO assignment, I2S configuration |
| Invalid PCM (always zero)   | Check INMP441 wiring, L/R pin            |
| MQTT identity mismatch      | Check sensor registry, sdkconfig         |
| DMA overrun                 | Check task priority, buffer sizing       |
