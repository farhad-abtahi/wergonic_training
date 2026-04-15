#include "vibrator.h"

// Support for the vibrator of Wergonic device.//

Adafruit_DRV2605 drv;
static void i2cScanner();
static void readRegister(uint8_t reg);
static void readInfo();
static void drvInit();

void vib(vibrator* myVib, uint8_t intensity)
{
    drv.setRealtimeValue(intensity);
}

void noVib()
{
    ledsOff();
    drv.setRealtimeValue(0x00);
}

void checkVib(vibrator myVib)
{
    Serial.println("Turn vib on.");
    drv.setRealtimeValue(0x10);
    delay(1500);

    Serial.println("Turn vib off.");
    drv.setRealtimeValue(0x00);
    delay(1000);
    delay(50);
}

// Vibration at different intenisties.
void alert(vibrator* myVib)
{
    Serial.println("Red warning.");
    ledsOff();
    digitalWrite(LED_BUILTIN, LOW);
    vib(myVib, 0.8 * myVib->vibIntensity);
}

void warning(vibrator* myVib)
{
    noVib();
    Serial.println("Yellow warning.");
    ledsOff();
    digitalWrite(LEDB, LOW);
    vib(myVib, 0.6 * myVib->vibIntensity);
    delay(myVib->alert_time);
    noVib();
    delay(myVib->alert_time);
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
