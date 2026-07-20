#include "main.h"
#include "version.h"

// Support for the main application of Wergonic device.//
// Initialize the appropriate services and advertise the device.//

werg_unit werg_device;

void mainTask()
{
    gpioInit();
    hwInit();
    Serial.println("Wergonic Vibrator v. " FIRMWARE_VERSION);
    configInit();
    bleAdvertise(&werg_device);
    while (1)
    {
        // while bluetooth connection isn't established keep polling.
        vibrator_update(werg_device.myVib); // advance non-blocking warning pulse.
        float angles[2] = {0, 0};
        bool angle_available = false;
        if (isCalibrated(&werg_device) && isTypeSet(&werg_device))
        {
            measure(&werg_device, angles, &angle_available);
        }
        readConsole(&werg_device);
        bool ble_connected = isBleConnected();
        if (!ble_connected)
        {
            // toggleLed(); // Indicate looking for a bluetooth connection.
            bleService(&werg_device); // Initiate the BLE service.
            ble_connected = isBleConnected();
        }
    }
}

void readConsole(werg_unit* werg_device)
{
    int incomingByte = 0;
    if (Serial.available())
    {
        incomingByte = Serial.read();
        // Skip CR and LF bytes without dispatching them as commands
        if (incomingByte == '\r' || incomingByte == '\n')
        {
            return;
        }
        const String input = String(incomingByte, HEX);
        Serial.print("Received from user:");
        Serial.println(input);
        parseCommand(input, werg_device);
    }
}

void gpioInit()
{
    pinMode(LEDG, OUTPUT);
    pinMode(LEDB, OUTPUT);
    pinMode(LED_BUILTIN, OUTPUT);
    ledsOff();
}

void hwInit()
{
    randomSeed(analogRead(A0));
    serialInit();
    i2cInit();
    bleInit();
    vibInit();
    wergInit(&werg_device);
}

void serialInit() { Serial.begin(115200); }

void i2cInit() { Wire.begin(); }

void configInit()
{
    flashPrefs savedPrefs = returnPrefs();
    // Uncomment this line to generate a new serial numnber for a device.
    // savedPrefs.devID = 0;
    if (savedPrefs.devID == 0)
    {
        savePreferencesID(); // Set device ID.
        savedPrefs = returnPrefs();
    }
    int savedIntensity = savedPrefs.intensity;
    if (savedIntensity != WEAK_VIB && savedIntensity != MEDIUM_VIB &&
        savedIntensity != STRONG_VIB)
    {
        savedIntensity = MEDIUM_VIB; // unset or corrupted flash record.
    }
    configDevIntensity(&werg_device, savedIntensity);
    configDevID(&werg_device, savedPrefs.devID);
    configDevType(&werg_device, savedPrefs.devType);
    restoreDevCalib(&werg_device, savedPrefs);
}
