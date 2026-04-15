#include "ble_service.h"

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
BLEByteCharacteristic
    switchCharacteristic("34802252-7185-4d5d-b431-630e7050e8f0",
                         BLERead | BLEWrite);
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
        while (central.connected())
        {
            long currentMillis = millis();
            ledsConnected();
            if (switchCharacteristic.written())
            {
                byte readValue;
                byte myRead[8];

                switchCharacteristic.readValue(readValue);
                const String readString = String(readValue, HEX);
                Serial.print("Received value in HEX:");
                Serial.println(readString);
                parseCommand(readString, werg_device);
            }
            float angles[2] = {0, 0};
            bool angle_available = false;
            if (isCalibrated(werg_device) && isTypeSet(werg_device))
            {
                measure(werg_device, angles, &angle_available);
                if (angle_available)
                {
                    if (werg_device->devType == ARM_DEV)
                    {
                        Serial.print("Send angle:");
                        Serial.println(angles[0]);
                        switchCharacteristicArm.writeValue(angles[0]);
                    }
                    else
                    {
                        Serial.print("Send angles:");
                        Serial.println(angles[0]);
                        Serial.println(angles[1]);
                        switchCharacteristicBend.writeValue(angles[0]);
                        delay(10);
                        switchCharacteristicSide.writeValue(angles[1]);
                    }
                    if (werg_device->feedback)
                    {
                        checkAngle(angles, werg_device);
                    }
                }
            }
        }
        // when the central disconnects, print it out:
        Serial.print(F("Disconnected from central: "));
        ledsOff();
        bleConnected = false;
        Serial.println(central.address());
    }
}

// Depending on the input from the app trigger a vibration.

void bleAdvertise(werg_unit* werg_device)
{
    Serial.println("BLE Service.");

    // set advertised local name and service UUID:
    // The name is the prefex : Wergonic Vib. plus the serial number of the
    // device.
    char bleName[20];
    String prefex = "Wergonic Vib. ";
    String devID = prefex + String(werg_device->devID);
    Serial.print("BLE name: ");
    Serial.println(devID);
    devID.toCharArray(bleName, 20);

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
