# Firmware ESP32-S3

Board: ESP32-S3 dengan modul ESP32-S3-WROOM-1-N16R8. Akuisisi dua SHT31 SEN0331 dan INMP441 menggunakan firmware Arduino existing. Tidak ada reflash/perubahan pin, interval, kalibrasi, format MQTT atau Wi-Fi dalam pekerjaan ini.

## Yang tersedia di USB

`recovered/` berisi 22 file sketch/config/header hasil build yang dipulihkan dari `build/esp32-enterprise/sketch`. Direktori ini **privat dan diabaikan Git**, karena memuat `local_config.h` serta artefak yang belum disanitasi. Original build dipertahankan agar bukti pemulihan tidak hilang. Tidak ditemukan `.ino` asli pada sumber USB yang diaudit. `DT_DataCenter.ino.cpp` adalah hasil preprocessing, bukan otomatis source Arduino asli yang dapat diperlakukan identik.

`firmware/esp32s3_datacenter/` adalah implementasi ESP-IDF yang sudah ada; jangan menggantikannya sebagai firmware board aktif tanpa bukti dan persetujuan. GitHub belum dapat dianggap arsip firmware aktif lengkap sebelum source `.ino` asli dan toolchain/libraries terverifikasi tersedia.

## Wiring dan library/toolchain

- SHT31-A: I2C0 SDA GPIO8, SCL GPIO9, 50 kHz, high repeatability, 1 Hz, CRC.
- SHT31-B: I2C1 SDA GPIO10, SCL GPIO11, konfigurasi sama.
- INMP441: WS GPIO4, BCLK GPIO5, DIN GPIO6, L/R GND kiri; 48 kHz, 24-bit, Philips I2S dua slot 32 clock, BCLK target 3.072 MHz. Target bukan bukti pengukuran fisik.
- Include hasil build: Arduino.h, Wire.h, WiFi.h, ESP_I2S.h, mqtt_client.h (ESP-MQTT), esp_random.h, Preferences.h, cJSON.h, esp_eap_client.h, esp_wifi.h, mbedTLS, network_config.h dan local_config.h. Versi Arduino ESP32 core dan library aktual harus dipulihkan dari build metadata/toolchain asli; jangan mengarang nomor versinya.

Template `local_config.example.h` memakai nama identifier yang benar, bukan credential asli. Jangan menyalin template menimpa private header yang tersedia. Broker build recovery berbeda dari referensi server saat ini; jangan mengubahnya atau mengklaim itu konfigurasi board berjalan tanpa akses perangkat.

RMS/peak dipertahankan dalam dBFS, bukan dBA. Kalibrasi akustik, survei posisi dan verifikasi kapasitas memori tetap memerlukan bukti perangkat fisik.
