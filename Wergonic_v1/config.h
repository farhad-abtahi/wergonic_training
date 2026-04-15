#ifndef CONFIG_H
#define CONFIG_H

#include "device.h"
// Struct for stored settings in flash memory.
typedef struct flashStruct
{
    int intensity =
        WEAK_VIB;  // intensity of vibration. Check "vibrator.h" for more info.
    int devID = 0; // device ID.
    type devType = DEFAULT; // default value for device type (arm,back).
    float calibRoll = 0;
    float calibPitch = 0;
} flashPrefs;

flashPrefs returnPrefs();                   // Return stored settings.
void loadPreferences();                     // Load from flash memory.
void savePreferences(int prefByte);         // Save to flash memory.
void savePreferencesID(void);               // Save to flash memory.
void savePreferencesType(type devType);     // Save device type to flash.
void savePreferencesCalib(float calibRoll, float calibPitch); // Save device calibration.
void printPreferences(flashPrefs thePrefs); // Print settings.
void printReturnCode(int rc);               // Print return code.

#endif
