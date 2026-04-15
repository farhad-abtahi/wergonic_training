#include "config.h"
#include "NanoBLEFlashPrefs.h"

// Support for preferences saved in flash memory of device.//

NanoBLEFlashPrefs myFlashPrefs;

flashPrefs globalPrefs;
bool prefSet = false;
bool prefEnable = true;

flashPrefs returnPrefs()
{
    loadPreferences();
    return globalPrefs;
}

void loadPreferences()
{
    // Load settings.
    Serial.println("Read settings record...");
    int rc = myFlashPrefs.readPrefs(&globalPrefs, sizeof(globalPrefs));
    if (rc == FDS_SUCCESS)
    {
        printPreferences(globalPrefs);
    }
    else
    {
        Serial.println(
            "No preferences found. Use default."); // This should be the case
                                                   // when running for the first
                                                   // time on that particular
                                                   // board.
        savePreferencesID();
        printReturnCode(rc);
    }
}

// Generate a random Unit number and save it to flash memory.
// The name will be of the following format : "Wergonic Vib. unit_nr", where
// unit_nr is randomly generated.
void savePreferencesID(void)
{
    Serial.println("Generate new ID: ");
    int number = random(1, 100);
    globalPrefs.devID = number;
    Serial.println(globalPrefs.devID);
    printReturnCode(myFlashPrefs.writePrefs(&globalPrefs, sizeof(globalPrefs)));
}

// Save the device type (arm or back) in flash memory.
void savePreferencesType(type devType)
{
    Serial.println("Save device type");
    globalPrefs.devType = devType;
    Serial.println(globalPrefs.devType);
    printReturnCode(myFlashPrefs.writePrefs(&globalPrefs, sizeof(globalPrefs)));
}

// Save the device calibration.
void savePreferencesCalib(float calibRoll, float calibPitch)
{
    Serial.println("Save calibration");
    globalPrefs.calibRoll = calibRoll;
    globalPrefs.calibPitch = calibPitch;
    Serial.println(globalPrefs.calibRoll);
    Serial.println(globalPrefs.calibPitch);
    printReturnCode(myFlashPrefs.writePrefs(&globalPrefs, sizeof(globalPrefs)));
}

void savePreferences(int prefByte)
{
    globalPrefs.intensity = prefByte;
    Serial.print("INTENSITY :");
    Serial.println(globalPrefs.intensity);
    printReturnCode(myFlashPrefs.writePrefs(&globalPrefs, sizeof(globalPrefs)));
}

// Print preference record to Serial.
void printPreferences(flashPrefs thePrefs)
{
    Serial.print("INTENSITY: ");
    Serial.println(thePrefs.intensity);
    delay(100);
    Serial.print("SERIAL NUMBER: ");
    Serial.println(thePrefs.devID);
    delay(100);
    Serial.print("DEVICE TYPE: ");
    Serial.println(thePrefs.devType);
    delay(100);
    Serial.print("DEVICE CALIB: ");
    Serial.println(thePrefs.calibRoll);
    Serial.println(thePrefs.calibPitch);
    delay(100);
}

// Print return code infos to Serial.
void printReturnCode(int rc)
{
    Serial.print("Return code: ");
    Serial.print(rc);
    Serial.print(", ");
    Serial.println(myFlashPrefs.errorString(rc));
}
