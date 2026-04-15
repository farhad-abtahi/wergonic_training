#ifndef BLE_SERVICE_H
#define BLE_SERVICE_H

#include "ArduinoBLE.h"
#include "config.h"
#include "dictionary.h"
#include "imu.h"
#include "leds.h"
#include "vibrator.h"
#include "device.h"

#define UUID_LIB_VERSION (F("0.1.5"))

void bleInit(void);
char* generateUUID(void);
void bleService(werg_unit *werg_device);
void bleAdvertise(werg_unit *werg_device);
bool isBleConnected(void);

const uint8_t UUID_MODE_VARIANT4 = 0;
const uint8_t UUID_MODE_RANDOM = 1;

class UUID : public Printable
{
public:
    UUID();

    //  at least one seed value is mandatory, two is better.
    void seed(uint32_t s1, uint32_t s2 = 0);
    //  generate a new UUID
    void generate();
    //  make a UUID string
    char* toCharArray();

    //  MODE
    void setVariant4Mode();
    void setRandomMode();
    uint8_t getMode();

    //  Printable interface
    size_t printTo(Print& p) const;

private:
    //  Marsaglia 'constants' + function
    uint32_t _m_w = 1;
    uint32_t _m_z = 2;
    uint32_t _random();

    //  UUID in string format
    char _buffer[37];
    uint8_t _mode = UUID_MODE_VARIANT4;

    // bool     _upperCase = false;
};

#endif
