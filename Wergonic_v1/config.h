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
    float calibValues[3] = {0, 0, 0}; // raw averaged accel vector at calibration time.
    uint32_t calibMagic = 0;          // CALIB_MAGIC when calibValues/calibRoll/calibPitch hold a valid saved calibration.
    bool calibRestoreOnBoot = false;  // restore saved calibration on boot. Off by default.
} flashPrefs;

flashPrefs returnPrefs();                   // Return stored settings.
void loadPreferences();                     // Load from flash memory.
void savePreferences(int prefByte);         // Save to flash memory.
void savePreferencesID(void);               // Save to flash memory.
void savePreferencesType(type devType);     // Save device type to flash.
void savePreferencesCalib(float calibRoll, float calibPitch, float calibValues[3]); // Save device calibration.
void savePreferencesCalibRestore(bool enabled); // Save calibration-restore-on-boot preference.
void printPreferences(flashPrefs thePrefs); // Print settings.
void printReturnCode(int rc);               // Print return code.

#endif
