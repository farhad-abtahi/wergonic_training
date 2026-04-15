#include "imu.h"
#include "config.h"
#include "device.h"
#include "leds.h"
#include "math.h"

// Support for the IMU sensor of Wergonic device.//

static void calibRoll(werg_unit* werg_device, FusedAngles* fusedAngles,
                      SimpleFusion* fuser);
LSM6DS3 myIMU(I2C_MODE, 0x6A);

// initialize embedded IMU sensor.
void imuInit(void)
{
    if (myIMU.begin() != 0)
    {
        Serial.println("Device error");
    }
    else
    {
        Serial.println("Device OK!");
    }
}

void getIMUaccel(werg_unit* werg_device)
{
    werg_device->imuVal->accelValues[0] = myIMU.readFloatAccelX();
    werg_device->imuVal->accelValues[1] = myIMU.readFloatAccelY();
    werg_device->imuVal->accelValues[2] = myIMU.readFloatAccelZ();
}

void getIMUgyro(werg_unit* werg_device)
{
    werg_device->imuVal->gyroValues[0] = myIMU.readFloatGyroX();
    werg_device->imuVal->gyroValues[1] = myIMU.readFloatGyroY();
    werg_device->imuVal->gyroValues[2] = myIMU.readFloatGyroZ();
}

float getIMUtemp(werg_unit* werg_device) { return myIMU.readTempC(); }

void printAccel(float* accelValues)
{
    Serial.print("Accelaration X:");
    Serial.println(accelValues[0]);
    Serial.print("Accelaration Y:");
    Serial.println(accelValues[1]);
    Serial.print("Accelaration Z:");
    Serial.println(accelValues[2]);
}

void printGyro(float* gyroValues)
{
    Serial.print("Gyro X:");
    Serial.println(gyroValues[0]);
    Serial.print("Gyro Y:");
    Serial.println(gyroValues[1]);
    Serial.print("Gyro Z:");
    Serial.println(gyroValues[2]);
}

void printTemp(float temp)
{
    Serial.print("Temperature :");
    Serial.println(temp);
}

// Function for calibrating the device. Sampling the IMU for 5 seconds and take
// the mean values. Then use them to calibrate initial pitch and roll.
void calibIMU(werg_unit* werg_device, SimpleFusion* fuser)
{
    long currentMillis = millis();
    long previousMillis = currentMillis;
    int samples = 0;
    float sumX = 0;
    float sumY = 0;
    float sumZ = 0;

    ledsCalib(); // indicate with a blue LED that calibration is taking place.
    Serial.println("Calibrating...");
    while (currentMillis - previousMillis <= CALIB_TIME)
    {
        getIMUaccel(werg_device);
        samples++;
        sumX = sumX + werg_device->imuVal->accelValues[0];
        sumY = sumY + werg_device->imuVal->accelValues[1];
        sumZ = sumZ + werg_device->imuVal->accelValues[2];
        currentMillis = millis();
    }

    werg_device->imuVal->calibValues[0] = sumX / samples;
    werg_device->imuVal->calibValues[1] = sumY / samples;
    werg_device->imuVal->calibValues[2] = sumZ / samples;

    FusedAngles fusedAngles;
    getIMUgyro(werg_device);
    calibRoll(werg_device, &fusedAngles, fuser);

    ledsOff();
    Serial.println("Calibration over.");
    ledsConnect();
    configDevCalib(werg_device, werg_device->calibRoll,
                   werg_device->calibPitch);
}

// Set the initial roll of the device.
static void calibRoll(werg_unit* werg_device, FusedAngles* fusedAngles,
                      SimpleFusion* fuser)
{
    ThreeAxis accelerometer;
    ThreeAxis gyroscope;

    accelerometer.x = werg_device->imuVal->calibValues[0];
    accelerometer.y = werg_device->imuVal->calibValues[1];
    accelerometer.z = werg_device->imuVal->calibValues[2];
    gyroscope.x = werg_device->imuVal->gyroValues[0];
    gyroscope.y = werg_device->imuVal->gyroValues[1];
    gyroscope.z = werg_device->imuVal->gyroValues[2];

    fuser->getFilteredAngles(accelerometer, gyroscope, fusedAngles,
                             UNIT_DEGREES);
    werg_device->calibRoll = fusedAngles->roll;
    werg_device->calibPitch = fusedAngles->pitch;
}
