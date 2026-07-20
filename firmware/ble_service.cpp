#include "ble_service.h"
#include "main.h"
#include <string.h>

// Support for the BLE service of Wergonic device. Includes support for
// generation of UUID.//

bool bleConnected = false;

UUID::UUID()
{
    seed(1, 2);
    setVariant4Mode();
    generate();
}

UUID uuid;

uint32_t start, stop, randomtime;

// BLE service characteristics.
BLEService
    vibService("34802252-7185-4d5d-b431-630e7050e8f0"); // Bluetooth® Low Energy
                                                        // LED Service
// Command characteristic - must support strings for multi-char commands
// Max length: R:/M: prefix (2) or DEL: prefix (4) + filename (18) = 22
// bytes total
BLEStringCharacteristic
    switchCharacteristic("34802252-7185-4d5d-b431-630e7050e8f0",
                         BLERead | BLEWrite, 22);  // 22 bytes max for all commands
BLEByteCharacteristic
    switchCharacteristicArm("872a73a9-ad52-47f3-8622-10e06c24c65f",
                            BLERead | BLEWrite);
BLEByteCharacteristic
    switchCharacteristicBend("4d3a9874-27e5-11ee-be56-0242ac120002",
                             BLERead | BLEWrite);
BLEByteCharacteristic
    switchCharacteristicSide("4d3a9acc-27e5-11ee-be56-0242ac120002",
                             BLERead | BLEWrite);
BLEByteCharacteristic
    switchCharacteristicSound("9ed7c9c8-2ae6-11ee-be56-0242ac120002",
                              BLERead | BLEWrite);
BLEByteCharacteristic
    switchCharacteristicType("43f799f0-2c6e-11ee-be56-0242ac120002",
                             BLERead | BLEWrite);
BLEByteCharacteristic
    switchCharacteristicIntensity("5d81b042-2c71-11ee-be56-0242ac120002",
                                  BLERead | BLEWrite);

// File transfer characteristic - uses String for larger payloads with notify
// Max 128 bytes per chunk for file streaming
BLEStringCharacteristic
    fileTransferCharacteristic("6e400003-b5a3-f393-e0a9-e50e24dcca9e",
                               BLERead | BLENotify, 128);

// long previousTime = 0;

// Initialize BLE service.
void bleInit()
{
    if (!BLE.begin())
    {
        Serial.println("starting Bluetooth® Low Energy module failed!");
        while (1)
            ;
    }
}

// Generate unique uid.
char* generateUUID()
{
    start = micros();
    uuid.seed(2);
    stop = micros();
    start = micros();
    uuid.generate();
    stop = micros();
    delay(100);
    start = micros();
    char* str_uuid = uuid.toCharArray();
    stop = micros();
    delay(500);
    return str_uuid;
}

bool isBleConnected() { return bleConnected; }

// BLE service.
void bleService(werg_unit* werg_device)
{
    // listen for Bluetooth® Low Energy peripherals to connect:
    BLEDevice central = BLE.central();

    // if a central is connected to peripheral:
    if (central)
    {
        Serial.print("Connected to central: ");
        bleConnected = true;
        switchCharacteristicSound.writeValue(werg_device->feedback);
        delay(10);
        switchCharacteristicType.writeValue(werg_device->devType);
        delay(20);
        switchCharacteristicIntensity.writeValue(
            werg_device->myVib->vibIntensity);
        Serial.print("Send Intensity: ");
        Serial.println(werg_device->myVib->vibIntensity);
        delay(10);
        // print the central's MAC address:
        Serial.println(central.address());
        // while the central is still connected to peripheral:
        // Note: Datetime is set via "T:YYYYMMDDHHmmss" command through parseCommand()
        while (central.connected())
        {
            unsigned long currentMillis = millis();
            ledsConnected();
            if (switchCharacteristic.written()) {
                // BLEStringCharacteristic provides direct String value
                String readString = switchCharacteristic.value();
                readString.trim();  // Remove any whitespace/newlines (match Serial behavior)
                Serial.print("BLE received (");
                Serial.print(readString.length());
                Serial.print(" chars): [");
                Serial.print(readString);
                Serial.println("]");
                parseCommand(readString, werg_device);
            }
            // Update vibrator state machine (critical for dash pattern)
            vibrator_update();

            // Serial commands must keep working while a central is connected
            readConsole(werg_device);

            float angles[2] = {0, 0};
            bool angle_available = false;
            if (isCalibrated(werg_device) && isTypeSet(werg_device))
            {
                measure(werg_device, angles, &angle_available);
                if (angle_available)
                {
                    if (werg_device->devType == ARM_DEV)
                    {
                        if (werg_device->debug)
                        {
                            Serial.print(F("Send angle:"));
                            Serial.println(angles[0]);
                        }
                        switchCharacteristicArm.writeValue(angles[0]);
                    }
                    else
                    {
                        if (werg_device->debug)
                        {
                            Serial.print(F("Send angles:"));
                            Serial.println(angles[0]);
                            Serial.println(angles[1]);
                        }
                        switchCharacteristicBend.writeValue(angles[0]);
                        delay(10);
                        switchCharacteristicSide.writeValue(angles[1]);
                    }
                }
            }

            // Handle SD save outside feedback path
            if (session_save_needed())
            {
                session_handle_save(werg_device);
            }
        }
        // BLE disconnected - device continues standalone
        Serial.println(F("Disconnected from central. Continuing standalone."));
        bleConnected = false;
        // Do NOT reset calibration or stop vibration - device keeps working
        // Save any buffered data
        if (session_save_needed())
        {
            session_handle_save(werg_device);
        }
    }
}

// Depending on the input from the app trigger a vibration.

void bleAdvertise(werg_unit* werg_device)
{
    Serial.println("BLE Service.");

    // set advertised local name and service UUID:
    // Short name format: "Wergonic-XX" (fits in BLE advertising packet)
    char bleName[16];
    snprintf(bleName, sizeof(bleName), "Wergonic-%d", werg_device->devID);
    Serial.print("BLE name: ");
    Serial.println(bleName);

    BLE.setLocalName(bleName);
    BLE.setAdvertisedService(vibService);

    // add the characteristic to the service
    vibService.addCharacteristic(switchCharacteristic);
    vibService.addCharacteristic(switchCharacteristicArm);
    vibService.addCharacteristic(switchCharacteristicBend);
    vibService.addCharacteristic(switchCharacteristicSide);
    vibService.addCharacteristic(switchCharacteristicSound);
    vibService.addCharacteristic(switchCharacteristicType);
    vibService.addCharacteristic(switchCharacteristicIntensity);
    vibService.addCharacteristic(fileTransferCharacteristic);

    // add service
    BLE.addService(vibService);

    // set the initial value for the characeristic:

    // start advertising
    BLE.advertise();
}

void UUID::seed(uint32_t s1, uint32_t s2)
{
    //  set Marsaglia constants, prevent 0 as value
    if (s1 == 0)
        s1 = 1;
    if (s2 == 0)
        s2 = 2;
    _m_w = s1;
    _m_z = s2;
}

//  check version 0.1.1 for more readable code
void UUID::generate()
{
    uint32_t ar[4];
    for (uint8_t i = 0; i < 4; i++)
    {
        ar[i] = _random();
        //  store binary version globally ?
        //  _ar[i] = ar[i];
    }
    if (_mode == UUID_MODE_VARIANT4)
    {
        ar[1] &= 0xFFF0FFFF; //  remove 4 bits.
        ar[1] |= 0x00040000; //  variant 4
        ar[2] &= 0xFFFFFFF3; //  remove 2 bits
        ar[2] |= 0x00000008; //  version 1
    }

    //  process 16 bytes build up the char array.
    for (uint8_t i = 0, j = 0; i < 16; i++)
    {
        //  multiples of 4 between 8 and 20 get a -.
        //  note we are processing 2 digits in one loop.
        if ((i & 0x1) == 0)
        {
            if ((4 <= i) && (i <= 10))
            {
                _buffer[j++] = '-';
            }
        }

        //  process one byte at the time instead of a nibble
        uint8_t nr = i / 4;
        uint8_t xx = ar[nr];
        uint8_t ch = xx & 0x0F;
        _buffer[j++] = (ch < 10) ? '0' + ch : ('a' - 10) + ch;

        ch = (xx >> 4) & 0x0F;
        ar[nr] >>= 8;
        _buffer[j++] = (ch < 10) ? '0' + ch : ('a' - 10) + ch;
    }

    _buffer[36] = 0;
}

char* UUID::toCharArray() { return _buffer; }

void UUID::setVariant4Mode() { _mode = UUID_MODE_VARIANT4; }

void UUID::setRandomMode() { _mode = UUID_MODE_RANDOM; }

uint8_t UUID::getMode() { return _mode; }

size_t UUID::printTo(Print& p) const { return p.print(_buffer); }

uint32_t UUID::_random()
{
    _m_z = 36969L * (_m_z & 65535L) + (_m_z >> 16);
    _m_w = 18000L * (_m_w & 65535L) + (_m_w >> 16);
    return (_m_z << 16) + _m_w; //   32-bit result
}

// Send a string via BLE file transfer characteristic
void ble_send_string(const char* str)
{
    if (bleConnected && str != nullptr)
    {
        fileTransferCharacteristic.writeValue(str);
        delay(10);  // Small delay to allow BLE stack to process
    }
}

// Send ACK response for command confirmation
void ble_send_ack(const char* cmd, const char* result)
{
    char buffer[64];
    snprintf(buffer, sizeof(buffer), "ACK:%s:%s", cmd, result);
    Serial.println(buffer);
    ble_send_string(buffer);
}

// Send ERROR response
void ble_send_error(const char* cmd, const char* reason)
{
    char buffer[64];
    snprintf(buffer, sizeof(buffer), "ERROR:%s:%s", cmd, reason);
    Serial.println(buffer);
    ble_send_string(buffer);
}

// Send file chunk via BLE
void ble_send_file_chunk(const char* data, size_t len, bool is_last)
{
    if (!bleConnected || data == nullptr || len == 0)
    {
        return;
    }

    // BLE notification max is 128 bytes (characteristic size)
    const size_t MAX_BLE_CHUNK = 124;  // Leave 4 bytes for BLE overhead
    size_t offset = 0;

    while (offset < len)
    {
        size_t chunk_size = len - offset;
        if (chunk_size > MAX_BLE_CHUNK)
        {
            chunk_size = MAX_BLE_CHUNK;
        }

        // Create a null-terminated chunk
        char chunk[MAX_BLE_CHUNK + 1];
        memcpy(chunk, data + offset, chunk_size);
        chunk[chunk_size] = '\0';

        fileTransferCharacteristic.writeValue(chunk);
        delay(5);  // Minimal delay for BLE stack

        offset += chunk_size;
    }

    // Send end marker if this is the last chunk
    if (is_last)
    {
        delay(5);
        fileTransferCharacteristic.writeValue("<<EOF>>");
    }
}
