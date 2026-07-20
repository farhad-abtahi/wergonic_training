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
    float calibValues[3] = {0, 0, 0}; // raw averaged accel vector at calibration time (see calibIMU); needed by calcAngleArm's filter-off branch.
    uint32_t calibMagic = 0;          // validity marker for the calib fields above; must equal CALIB_MAGIC (device.h) to be trusted. NanoBLEFlashPrefs::readPrefs() memcpy's the full struct size regardless of what was written, so an old/short flash record leaves this field holding whatever bytes follow it in flash (not guaranteed zero) — restore is safe because those bytes would need to coincidentally equal CALIB_MAGIC exactly (~1 in 2^32) to be trusted.
    bool calibRestoreOnBoot = false;  // persisted user preference: restore last calibration on boot (U/Y commands). Default OFF.
} flashPrefs;

flashPrefs returnPrefs();                   // Return stored settings.
void loadPreferences();                     // Load from flash memory.
void savePreferences(int prefByte);         // Save to flash memory.
void savePreferencesID(void);               // Save to flash memory.
void savePreferencesType(type devType);     // Save device type to flash.
void savePreferencesCalib(float calibRoll, float calibPitch, const float calibValues[3]); // Save device calibration (angle + raw accel vector) and mark it valid, in one flash write.
void savePreferencesCalibRestore(bool enabled); // Save calibration-restore-on-boot preference.
void printPreferences(flashPrefs thePrefs); // Print settings.
void printReturnCode(int rc);               // Print return code.

#endif
