#include <assert.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

#include "connectivity_policy.h"

static const char BOOT_ID[] = "00112233445566778899aabbccddeeff";

static connectivity_config_t valid_config(void)
{
    return (connectivity_config_t){
        .wifi_ssid = "rack-network",
        .wifi_password = "bounded-password",
        .mqtt_broker_uri = "mqtt://broker.local:1883",
        .mqtt_username = "",
        .mqtt_password = "",
    };
}

static void test_reconnect_policy(void)
{
    uint32_t delay = CONNECTIVITY_WIFI_RECONNECT_INITIAL_MS;
    const uint32_t expected[] = {2000, 4000, 8000, 16000, 30000, 30000};
    assert(delay == 1000U);
    for (size_t index = 0; index < sizeof(expected) / sizeof(expected[0]);
         ++index) {
        delay = connectivity_next_reconnect_delay_ms(delay);
        assert(delay == expected[index]);
    }
    assert(connectivity_next_reconnect_delay_ms(0U) == 1000U);
}

static void test_configuration(void)
{
    connectivity_config_t config = valid_config();
    assert(connectivity_config_valid(&config));

    config.wifi_ssid = "";
    assert(!connectivity_config_valid(&config));
    config = valid_config();
    config.wifi_password = "";
    assert(!connectivity_config_valid(&config));
    config = valid_config();
    config.mqtt_broker_uri = "";
    assert(!connectivity_config_valid(&config));
    config = valid_config();
    config.mqtt_broker_uri = "mqtt://user:secret@broker.local";
    assert(!connectivity_config_valid(&config));

    config = valid_config();
    config.mqtt_username = "optional-user";
    assert(connectivity_config_valid(&config));
    config = valid_config();
    config.mqtt_password = "optional-password";
    assert(connectivity_config_valid(&config));

    config = valid_config();
    config.mqtt_broker_uri = "mqtts://broker.local:8883";
    assert(connectivity_config_valid(&config));
    assert(connectivity_uri_is_tls(config.mqtt_broker_uri));
    assert(!connectivity_uri_is_tls("mqtt://broker.local"));
}

static void test_client_id(void)
{
    char client_id[CONNECTIVITY_MQTT_CLIENT_ID_LENGTH + 1U];
    char unchanged[sizeof(BOOT_ID)];
    memcpy(unchanged, BOOT_ID, sizeof(unchanged));

    assert(connectivity_format_client_id(BOOT_ID, client_id,
                                         sizeof(client_id)));
    assert(strcmp(client_id, "dt-00112233445566778899aabbccddeeff") == 0);
    assert(memcmp(BOOT_ID, unchanged, sizeof(BOOT_ID)) == 0);
    assert(!connectivity_format_client_id(BOOT_ID, client_id,
                                          sizeof(client_id) - 1U));
    assert(!connectivity_format_client_id(
        "00112233445566778899AABBCCDDEEFF", client_id, sizeof(client_id)));
}

static void test_device_status(void)
{
    char topic[CONNECTIVITY_DEVICE_STATUS_TOPIC_CAPACITY];
    char payload[CONNECTIVITY_DEVICE_STATUS_PAYLOAD_CAPACITY];

    assert(connectivity_format_device_status(
        "test-site", "test-device", BOOT_ID, false, topic, sizeof(topic),
        payload, sizeof(payload)));
    assert(strcmp(topic, "dt/test-site/device/test-device/status") == 0);
    assert(strcmp(payload,
                  "{\"schema_version\":\"1.0\",\"site_id\":\"test-site\","
                  "\"device_id\":\"test-device\","
                  "\"boot_id\":\"00112233445566778899aabbccddeeff\","
                  "\"status\":\"offline\"}") == 0);
    assert(strstr(payload, "\"seq\"") == NULL);

    assert(connectivity_format_device_status(
        "test-site", "test-device", BOOT_ID, true, topic, sizeof(topic),
        payload, sizeof(payload)));
    assert(strstr(payload, "\"status\":\"online\"") != NULL);
    assert(strstr(topic, "dt-001122") == NULL);
    assert(!connectivity_format_device_status(
        "Invalid Site", "test-device", BOOT_ID, true, topic, sizeof(topic),
        payload, sizeof(payload)));
    assert(!connectivity_format_device_status(
        "test-site", "test-device", BOOT_ID, true, topic,
        strlen("dt/test-site/device/test-device/status"), payload,
        sizeof(payload)));
    assert(!connectivity_format_device_status(
        "test-site", "test-device", BOOT_ID, true, topic, sizeof(topic),
        payload, 8U));

    char maximum_site_id[65];
    char maximum_device_id[65];
    memset(maximum_site_id, 'a', sizeof(maximum_site_id) - 1U);
    memset(maximum_device_id, 'b', sizeof(maximum_device_id) - 1U);
    maximum_site_id[sizeof(maximum_site_id) - 1U] = '\0';
    maximum_device_id[sizeof(maximum_device_id) - 1U] = '\0';
    assert(connectivity_format_device_status(
        maximum_site_id, maximum_device_id, BOOT_ID, false, topic,
        sizeof(topic), payload, sizeof(payload)));
    assert(strlen(topic) == CONNECTIVITY_DEVICE_STATUS_TOPIC_CAPACITY - 1U);
    assert(strlen(payload) ==
           CONNECTIVITY_DEVICE_STATUS_PAYLOAD_CAPACITY - 1U);
}

static void test_publish_arguments(void)
{
    const uint8_t payload[] = {0x00, 0x7f, 0xff};
    assert(connectivity_publish_arguments_valid("dt/data", payload,
                                                sizeof(payload)));
    assert(connectivity_publish_arguments_valid("dt/empty", NULL, 0U));
    assert(!connectivity_publish_arguments_valid(NULL, payload,
                                                 sizeof(payload)));
    assert(!connectivity_publish_arguments_valid("", payload,
                                                 sizeof(payload)));
    assert(!connectivity_publish_arguments_valid("dt/+", payload,
                                                 sizeof(payload)));
    assert(!connectivity_publish_arguments_valid("dt/data", NULL, 1U));
    assert(!connectivity_publish_arguments_valid(
        "dt/data", payload, CONNECTIVITY_MQTT_MAX_PAYLOAD_BYTES + 1U));
}

static void test_counter_saturation(void)
{
    uint64_t counter = UINT64_MAX - 1U;
    connectivity_counter_increment(&counter);
    assert(counter == UINT64_MAX);
    connectivity_counter_increment(&counter);
    assert(counter == UINT64_MAX);
}

int main(void)
{
    test_reconnect_policy();
    test_configuration();
    test_client_id();
    test_device_status();
    test_publish_arguments();
    test_counter_saturation();
    puts("connectivity policy tests: PASS");
    return 0;
}
