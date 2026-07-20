#ifndef VIBRATOR_H
#define VIBRATOR_H

#include "Adafruit_DRV2605.h"
#include "Arduino.h"
#include "leds.h"
#include "stdint.h"

// Intensity for Vibrator. 100 is quite strong.
#define STRONG_VIB 8
#define MEDIUM_VIB 6
#define WEAK_VIB 4

// Time for red vibration and for break between warning vibration.
#define ALERT_TIME 300 // msec.
#define PAUSE_TIME 600 // msec.

// Struct for vibrator settings.
struct vibrator
{
    const int alert_time = ALERT_TIME;
    const int pause_time = PAUSE_TIME;
    uint8_t vibIntensity = 10*MEDIUM_VIB;  // default value for intensity if the user doesn't change it.
};

// Vibration state machine phases
enum VibPhase
{
    VIB_IDLE,
    VIB_WARNING_PULSE1,
    VIB_WARNING_PAUSE,
    VIB_WARNING_PULSE2,
    VIB_ALERT_ON
};

void checkVib(vibrator *myVib); // Fast check of the vibrator unit.
void alert(vibrator* myVib); // Vibrate consistently for duration = ALERT_TIME.
void warning(vibrator* myVib); // Start non-blocking warning pattern.
void noVib(void);              // Stop vibration.
void vib(vibrator* myVib,uint8_t intensity); // Trigger a vibration with the currently configured
                           // intensity.
void vibInit(void);

// Non-blocking vibration update - call in main loop
void vibrator_update(void);

// Check if vibrator is currently in a pattern
bool vibrator_is_busy(void);

#endif
