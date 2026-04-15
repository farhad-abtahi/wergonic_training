#ifndef IMU_H_
#define IMU_H_

#include "device.h"
#include "SimpleFusion.h"

#define IMU_FREQ 10// msec. 1 sample/seconds = 1Hz
#define DEV_FREQ 500// msec. 1 sample/seconds = 1Hz
#define CALIB_TIME 5 * 1000


void imuInit(void); // initialize IMU sensor.
void getIMUaccel(werg_unit *werg_device); // get accelerometer values.
void getIMUgyro(werg_unit *werg_device); // get gyroscope values.
float getIMUtemp(werg_unit *werg_device); // get temperature.
void calibIMU(werg_unit *werg_device,SimpleFusion *fuser); // calibrate IMU.
void printAccel(float* accelValues); // print X,Y,Z acceleration.
void printGyro(float* gyroValues);   // print X,Y,Z rotation.
void printTemp(float temp);          // print temperature.

#endif // IMU_H_
