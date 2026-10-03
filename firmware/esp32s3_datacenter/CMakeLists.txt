cmake_minimum_required(VERSION 3.16)

set(IDF_TARGET "esp32s3")
set(COMPONENTS main esp_psram nvs_flash)
include($ENV{IDF_PATH}/tools/cmake/project.cmake)
project(esp32s3_datacenter)
