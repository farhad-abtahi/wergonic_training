#include "imu.h"
#include "ble_service.h"
#include "config.h"
#include "device.h"
#include "leds.h"
#include "math.h"

// Support for the IMU sensor of Wergonic device.//

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
    unsigned long currentMillis = millis();
    unsigned long previousMillis = currentMillis;
    int samples = 0;
    float sumX = 0;
    float sumY = 0;
    float sumZ = 0;
    float sumGX = 0;
    float sumGY = 0;
    float sumGZ = 0;

    ledsCalib(); // indicate with a blue LED that calibration is taking place.
    Serial.println("Calibrating...");
    while (currentMillis - previousMillis <= CALIB_TIME)
    {
        getIMUaccel(werg_device);
        getIMUgyro(werg_device);
        samples++;
        sumX = sumX + werg_device->imuVal->accelValues[0];
        sumY = sumY + werg_device->imuVal->accelValues[1];
        sumZ = sumZ + werg_device->imuVal->accelValues[2];
        sumGX = sumGX + werg_device->imuVal->gyroValues[0];
        sumGY = sumGY + werg_device->imuVal->gyroValues[1];
        sumGZ = sumGZ + werg_device->imuVal->gyroValues[2];
        // Keep BLE connection and vibration alive during the 5 s loop
        BLE.poll();
        vibrator_update();
        currentMillis = millis();
    }

    werg_device->imuVal->calibValues[0] = sumX / samples;
    werg_device->imuVal->calibValues[1] = sumY / samples;
    werg_device->imuVal->calibValues[2] = sumZ / samples;

    // Gyro bias from the stationary window (LSM6DS3 outputs deg/s; the
    // filter integrates rad/s)
    fuser->setGyroBias((sumGX / samples) * DEG_TO_RAD,
                       (sumGY / samples) * DEG_TO_RAD,
                       (sumGZ / samples) * DEG_TO_RAD);

    // Neutral pitch/roll directly from the averaged gravity vector, using
    // the same formulas as the filter. Seeding the filter with these angles
    // makes the post-calibration deltas start at zero instead of leaving a
    // baseline offset of ~alpha * mounting angle.
    float cx = werg_device->imuVal->calibValues[0];
    float cy = werg_device->imuVal->calibValues[1];
    float cz = werg_device->imuVal->calibValues[2];
    float pitchRad = atan2(-cx, sqrt(cy * cy + cz * cz));
    float rollRad = atan2(cy, sqrt(cx * cx + cz * cz));
    fuser->setAngles(pitchRad, rollRad);
    werg_device->calibPitch = pitchRad * (180.0f / M_PI);
    werg_device->calibRoll = rollRad * (180.0f / M_PI);

    ledsOff();
    Serial.println("Calibration over.");
    ledsConnect();
    configDevCalib(werg_device, werg_device->calibRoll,
                   werg_device->calibPitch);
}
