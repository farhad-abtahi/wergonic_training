#include "main.h"

// Support for the main application of Wergonic device.//
// Initialize the appropriate services and advertise the device.//

werg_unit werg_device;

void mainTask()
{
    gpioInit();
    hwInit();
    Serial.println(F("Wergonic Vibrator v. " FIRMWARE_VERSION));
    configInit();
    bleAdvertise(&werg_device);
    while (1)
    {
        // Update non-blocking vibrator state machine
        vibrator_update();

        // Measure angles if calibrated
        float angles[2] = {0, 0};
        bool angle_available = false;
        if (isCalibrated(&werg_device) && isTypeSet(&werg_device))
        {
            measure(&werg_device, angles, &angle_available);
        }

        // Handle SD save outside measure/feedback path
        if (session_save_needed())
        {
            session_handle_save(&werg_device);
        }

        // Process serial commands
        readConsole(&werg_device);

        // Handle BLE connection
        bool ble_connected = isBleConnected();
        if (!ble_connected)
        {
            bleService(&werg_device);
            ble_connected = isBleConnected();
        }
    }
}

void readConsole(werg_unit* werg_device)
{
    if (Serial.available()) {
    String input = Serial.readStringUntil('\n');  // Leer hasta que se presione Enter
    input.trim();  // Elimina espacios y saltos de línea
    Serial.print("Received from user: ");
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
    sd_init();
    wergInit(&werg_device);
}

void serialInit()
{
    Serial.begin(115200);
    // readStringUntil() blocks until newline or timeout; the 1000 ms default
    // would stall the whole loop (and vibration) for a second on partial
    // input. 50 ms is ample for a complete command line at 115200 baud.
    Serial.setTimeout(50);
}

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
    // Restore the persisted intensity (set via S/M/W); fall back to medium
    // if flash holds an unexpected value
    uint8_t intensity = MEDIUM_VIB;
    if (savedPrefs.intensity == WEAK_VIB ||
        savedPrefs.intensity == MEDIUM_VIB ||
        savedPrefs.intensity == STRONG_VIB)
    {
        intensity = savedPrefs.intensity;
    }
    configDevIntensity(&werg_device, intensity);
    configDevID(&werg_device, savedPrefs.devID);
    configDevType(&werg_device, savedPrefs.devType);
    // if (savedPrefs.calibRoll != 0)
    // {
    //     configDevCalib(&werg_device, savedPrefs.calibRoll,
    //                    savedPrefs.calibPitch);
    // }
}
