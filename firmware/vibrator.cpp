#include "vibrator.h"

// Support for the vibrator of Wergonic device.//

Adafruit_DRV2605 drv;
static void i2cScanner();
static void readRegister(uint8_t reg);
static void readInfo();
static void drvInit();

// Non-blocking vibration state machine
static VibPhase vib_phase = VIB_IDLE;
static unsigned long vib_timer = 0;
static vibrator* current_vib = nullptr;

void vib(vibrator* myVib, uint8_t intensity)
{
    drv.setRealtimeValue(intensity);
}

// Silence the motor without cancelling a running pattern (internal use:
// the gap between warning pulses).
static void motorOff()
{
    ledsOff();
    drv.setRealtimeValue(0x00);
}

// Stop vibration AND cancel any running pattern. Without the phase reset,
// a warning interrupted mid-pulse would re-energize the motor when the
// state machine reached the second pulse.
void noVib()
{
    motorOff();
    vib_phase = VIB_IDLE;
    current_vib = nullptr;
}

void checkVib(vibrator myVib)
{
    Serial.println(F("Turn vib on."));
    drv.setRealtimeValue(0x10);
    delay(1500);

    Serial.println(F("Turn vib off."));
    drv.setRealtimeValue(0x00);
    delay(1000);
}

// Vibration at different intensities.
void alert(vibrator* myVib)
{
    Serial.println(F("Red warning."));
    ledsOff();
    digitalWrite(LED_BUILTIN, LOW);
    vib(myVib, 0.8 * myVib->vibIntensity);
    vib_phase = VIB_ALERT_ON;
    vib_timer = millis();
    current_vib = myVib;
}

// Non-blocking warning - starts the pattern, call vibrator_update() in main loop
void warning(vibrator* myVib)
{
    // Don't start new pattern if one is already running
    if (vib_phase != VIB_IDLE && vib_phase != VIB_ALERT_ON)
    {
        return;
    }

    Serial.println(F("Yellow warning."));
    ledsOff();
    digitalWrite(LEDB, LOW);

    // Start first pulse
    vib(myVib, 0.6 * myVib->vibIntensity);
    vib_phase = VIB_WARNING_PULSE1;
    vib_timer = millis();
    current_vib = myVib;
}

// Update function - call this in the main loop for non-blocking operation
void vibrator_update()
{
    if (vib_phase == VIB_IDLE || current_vib == nullptr)
    {
        return;
    }

    unsigned long elapsed = millis() - vib_timer;

    switch (vib_phase)
    {
        case VIB_WARNING_PULSE1:
            if (elapsed >= current_vib->alert_time)
            {
                motorOff();
                vib_phase = VIB_WARNING_PAUSE;
                vib_timer = millis();
            }
            break;

        case VIB_WARNING_PAUSE:
            if (elapsed >= current_vib->pause_time)
            {
                vib(current_vib, 0.6 * current_vib->vibIntensity);
                digitalWrite(LEDB, LOW);
                vib_phase = VIB_WARNING_PULSE2;
                vib_timer = millis();
            }
            break;

        case VIB_WARNING_PULSE2:
            if (elapsed >= current_vib->alert_time)
            {
                noVib(); // pattern complete - stops motor and resets phase
            }
            break;

        case VIB_ALERT_ON:
            if (elapsed >= current_vib->alert_time)
            {
                // Alert stays on until explicitly stopped or timeout
                // Keep vibrating but allow state to be checked
            }
            break;

        default:
            break;
    }
}

// Check if vibrator is currently running a pattern
bool vibrator_is_busy()
{
    return (vib_phase != VIB_IDLE);
}

// Detect the Adafruit driver and read the registers.
void vibInit()
{
    i2cScanner(); // detect the drv2605L as an I2C device.
    delay(500);
    drvInit(); // use the driver library to set the MODE for drv2605L.
    Serial.println("Driver init: ");
    readInfo(); // read drv2605L to confirm the changes.
    delay(500);
}

// Initialize the driver. Currently MODE 5.
static void drvInit()
{
    drv.begin();
    drv.selectLibrary(1);
    drv.setMode(DRV2605_MODE_REALTIME);
}

// Function for detecting the DRV2605L.
static void i2cScanner()
{
    byte error, address;
    int nDevices;

    Serial.println("Scanning...");

    nDevices = 0;
    for (address = 1; address < 127; address++)
    {
        Wire.beginTransmission(address);
        error = Wire.endTransmission();

        if (error == 0)
        {
            Serial.print("I2C device found at address 0x");
            if (address < 16)
                Serial.print("0");

            Serial.print(address, HEX);
            Serial.println("  !");

            nDevices++;
        }
        else if (error == 4)
        {
            Serial.print("Unknown error at address 0x");
            if (address < 16)
                Serial.print("0");

            Serial.println(address, HEX);
        }
    }

    if (nDevices == 0)
        Serial.println("No I2C devices found");
    else
        Serial.println("done");
}

// Functions for reading info of the DRV2605L registers.
static void readInfo()
{
    Serial.print("Register 0x00: ");
    readRegister(0x00); // must be E0 for default device ID : 7 DRV2605L
                        // (low-voltage version of the DRV2605 device).
    Serial.print("Register 0x01: ");
    readRegister(0x01); // before driver is initialised it must be : 40 -> no
                        // mode selected, standby mode on.
}

static void readRegister(uint8_t reg)
{
    Wire.beginTransmission(0x5A);
    Wire.write(reg);
    Wire.endTransmission();
    Wire.requestFrom(0x5A, 1);
    byte LSB = Wire.read();
    Serial.println(LSB, HEX);
}
