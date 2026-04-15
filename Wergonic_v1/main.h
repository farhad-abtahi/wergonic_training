#ifndef MAIN_H_
#define MAIN_H_

#include "Adafruit_DRV2605.h"
#include "LSM6DS3.h"
#include "ble_service.h"
#include "config.h"
#include "imu.h"
#include "leds.h"
#include "vibrator.h"
#include "device.h"

void mainTask(void); // initialize HW and start the BLE service.
void gpioInit(void); // initialize vibrator, imu sensor, serial service, i2c and  ble service.
void hwInit(void);   // set the LED pins as output.
void serialInit(void); // initialize serial service.
void i2cInit(void);    // initialize i2c service.
void configInit(void); // load settings and configure device.
void readConsole(werg_unit *werg_device); // read input from user.

#endif // MAIN_H_
