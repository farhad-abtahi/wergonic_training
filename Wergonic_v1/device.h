#ifndef DEVICE_H_
#define DEVICE_H_

#include "LSM6DS3.h"
#include "Wire.h"
#include "vibrator.h"

// Thresholds for angles.
#define YELLOW_LIMIT_ARM 30 // degrees. Above that angle a yellow warning is triggered.
#define RED_LIMIT_ARM 60 // degrees. Above that angle a red warning is triggered.

#define YELLOW_LIMIT_NECK 20 // degrees. Above that angle a yellow warning is triggered.
#define RED_LIMIT_NECK 45 // degrees. Above that angle a red warning is triggered.

#define YELLOW_LIMIT_SIDE 30 // degrees. Above that angle a yellow warning is triggered.
#define RED_LIMIT_SIDE 60 // degrees. Above that angle a yellow warning is triggered.

// type of device (arm or back).
typedef enum
{
    DEFAULT,
    ARM_DEV,
    BACK_DEV
} type;

// Struct for IMU values.
struct imu_values
{
    float calibValues[3] = {0, 0, 0}; // the values for calibrating the sensor.
    float accelValues[3] = {0, 0, 0}; // the measured accelerometer values.
    float gyroValues[3] = {0, 0, 0};  // the measured gyroscope values.
    float temp = 0; // temperature.
};

// Struct for Wergonic device.
struct werg_unit
{
  imu_values *imuVal; // imu values
  vibrator  *myVib; // vibrator
  bool calibrated = false;
  float calibRoll = 0; // calibration angle
  float calibPitch = 0;
  type devType = DEFAULT;
  bool feedback = false;
  int feedback_rest = 0; // time to wait before giving feedback again.
  int devID = 0; // default value for serial number if one has not been set.
};

bool isTypeSet(werg_unit *werg_device);
bool isCalibrated(werg_unit *werg_device);
void configDevID(werg_unit *werg_device, int devID); // save device ID to flash.
void configDevType(werg_unit *werg_device, type devType); // save device type (arm or back) to flash.
void configDevCalib(werg_unit *werg_device, float calibRoll, float calibPitch); // save device calibration angle to flash.
void configDevIntensity(werg_unit *werg_device, uint8_t intensity); // save device vibration intesity to flash.
void measure(werg_unit *werg_device, float *angles, bool *angle_available); // periodically measure angle (used when no BLE connection).
void wergInit(werg_unit *werg_device); // initialize the Wergonic device.
void fuserInit(void); // initialize fuser to be used for comp. filter TODO
void calibDevice(werg_unit *werg_device); // calibrate device.
void checkAngle(float *angles, werg_unit* werg_device); // check angle limits.
void takeSample(werg_unit* werg_device,float *angles); // sample IMU.
void parseCommand(const String readString, werg_unit* werg_device); // parse commands for device.

#endif // DEVICE_H_
