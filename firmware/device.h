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

// Calibration flash-record validity marker. A persisted calibration record
// (calibRoll/calibPitch/calibValues[3] in flashPrefs) is only trusted for
// boot-time restore when calibMagic reads back exactly this value; the
// flashPrefs default is 0, so a fresh device or an old/short flash record
// (predating these fields) safely reads as "no calibration saved" instead
// of restoring garbage.
#define CALIB_MAGIC 0x43414C32UL // "CAL2"

// Defined in config.h; forward-declared here to avoid a circular include
// (config.h includes device.h for the `type` enum).
struct flashStruct;

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

// Session metadata for recording information
struct session_metadata
{
    char subject_name[17] = "";     // Max 16 chars + null terminator
    uint16_t year = 0;              // Start datetime
    uint8_t month = 0;
    uint8_t day = 0;
    uint8_t hour = 0;
    uint8_t minute = 0;
    uint8_t second = 0;
    unsigned long session_start_ms = 0;  // millis() at session start
    float threshold_yellow = 0;     // Active thresholds at session start
    float threshold_red = 0;
    int threshold_margin = 0;
    bool filter_enabled = true;     // Filter state at session start
    float gyro_favoring = 0.96f;    // Gyro favoring ratio used
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
  int threshold_margin = 0; // default value for threshold margin.
  unsigned long session_begin = 0; // millis() at session start (unsigned long: a float loses ms precision after ~4.6 h of uptime).
  bool session_active = false; // SD logging runs while true (set by C, cleared by K). Independent of the vibration feedback flag.
  session_metadata session_meta;    // Session metadata
  bool datetime_set = false;        // True if datetime was set via BLE
  bool debug = false;               // Verbose 25 Hz serial prints (E/Q commands). Off by default: continuous printing costs ~1-2 KB/s of serial bandwidth and can stall on USB-CDC.
  bool calibRestoreOnBoot = false;  // Runtime pref (U/Y commands, BLE toggle): restore last calibration from flash on boot. Off by default.
};

bool isTypeSet(werg_unit *werg_device);
bool isCalibrated(werg_unit *werg_device);
void configDevID(werg_unit *werg_device, int devID); // save device ID to flash.
void configDevType(werg_unit *werg_device, type devType); // save device type (arm or back) to flash.
void configDevCalib(werg_unit *werg_device, float calibRoll, float calibPitch, const float calibValues[3]); // save device calibration angle + raw accel vector to flash.
bool isCalibDataSane(const struct flashStruct &prefs); // sanity-range check for a persisted calibration record (defense in depth beyond the magic marker).
void restoreCalibFromFlash(werg_unit *werg_device, const struct flashStruct &savedPrefs); // restore last calibration (and seed the fusion filter) from a flash record already validated as sane; called once from configInit().
void configDevIntensity(werg_unit *werg_device, uint8_t intensity); // save device vibration intesity to flash.
void measure(werg_unit *werg_device, float *angles, bool *angle_available); // periodically measure angle (used when no BLE connection).
void wergInit(werg_unit *werg_device); // initialize the Wergonic device.
void fuserInit(void); // initialize fuser to be used for comp. filter TODO
void calibDevice(werg_unit *werg_device); // calibrate device.
void checkAngle(float *angles, werg_unit* werg_device, bool* feedback); // check angle limits.
void takeSample(werg_unit* werg_device,float *angles); // sample IMU.
void parseCommand(const String readString, werg_unit* werg_device); // parse commands for device.
bool store_session(werg_unit* werg_device); // flush remaining buffer + close file (K cmd).
bool session_save_needed(void);              // check if drain buffer needs writing.
void session_handle_save(werg_unit* werg_device); // non-blocking chunked write (main loop).
void session_write_chunk(werg_unit* werg_device); // write WRITE_CHUNK rows per call.
void session_close_file(void);               // flush and close session file.

#endif // DEVICE_H_
