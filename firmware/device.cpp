#include "device.h"
#include "config.h"
#include "dictionary.h"
#include "imu.h"
#include "simpleFusion.h"
#include "vibrator.h"
#include "SD_card.h"
#include "ble_service.h"
#include <string.h>
#include <math.h>
// #include "rtc.h"
// Support for calculating the angle from the IMU data.

// Forward declarations for SD functions (needed due to circular include with SD_card.h)
extern bool sd_is_available(void);
extern void sd_set_unavailable(void);
extern bool sd_write_metadata(werg_unit* device);
extern char session_filename[];
extern String format_elapsed_time(uint32_t elapsed_ms);

#include "version.h"

static void getAngleArm(werg_unit* werg_device, float* angles);
static void getAngleBack(werg_unit* werg_device, float* angles);
static float calcAngleArm(werg_unit* werg_device);
static void calcAnglesBackSide(werg_unit* werg_device, float* angleBack,
                               float* angleSide);

// Double-buffer system for non-blocking SD writes
#define SD_LOG_FREQ 100   // ms between SD samples (10Hz logging)
#define BUF_SIZE 50       // 5 sec at 10Hz per buffer
#define WRITE_CHUNK 1     // Return to IMU/BLE/vibration after each synchronous row

struct SessionSample
{
    float angle;
    float feedback;
    uint32_t elapsed_ms;
};

static SessionSample buffers[2][BUF_SIZE];
static int buf_fill = 0;           // fill index in active buffer
static int active_buf = 0;         // 0 or 1: which buffer measure() writes to
static bool write_pending = false;  // true = inactive buffer needs draining
static int drain_count = 0;
static unsigned long previousBufferDrain = 0;
static int write_pos = 0;          // next row to write in drain buffer
static File session_file;          // kept open across writes
static bool file_open = false;
static bool header_written = false;
static bool metadata_written = false;
static bool session_initialized = false;
static uint32_t session_dropped_samples = 0;
static const char* session_write_error = "SD row write failed";


SimpleFusion fuser;

unsigned long previousMillis = 0;
unsigned long previousMillisFilter = 0;
unsigned long previousMillisSDLog = 0;  // SD logging at 10Hz (separate from 25Hz feedback)
int num_of_samples = 0;    // Number of samples used to calculate average.
float sum_of_angles = 0;   // Sum of angles.
float sum_of_angles_2 = 0; // Sum of angles for back.
unsigned long last_feedback_red_warning = 0;    // Last time there was a red warning.
unsigned long last_feedback_yellow_warning = 0; // Last time there was a yellow warning.
unsigned long last_feedback_green = 0;          // Last time there was no warning.
#define FEEDBACK_REST 2000 // mseconds between yellow warning triggers (pattern=1200ms + 800ms gap for dash effect).
#define TRANSITION_TIME_DOWN                                                   \
    500 // mseconds to account for as a transition time when going rapidly from
        // red to green and vice versa.
#define TRANSITION_TIME_UP                                                     \
    500 // mseconds to account for as a transition time when going rapidly from
        // red to green and vice versa.

const float g = 9.82;

// Helper function to parse datetime from BLE command
// Format: YYYYMMDDHHmmss (14 characters)
static void parseDateTime(const String& dt, werg_unit* werg_device)
{
    if (dt.length() != 14)
    {
        Serial.println(F("Invalid datetime format. Use: T:YYYYMMDDHHmmss"));
        ble_send_error("T", "Invalid format");
        return;
    }

    // Parse values
    uint16_t year = dt.substring(0, 4).toInt();
    uint8_t month = dt.substring(4, 6).toInt();
    uint8_t day = dt.substring(6, 8).toInt();
    uint8_t hour = dt.substring(8, 10).toInt();
    uint8_t minute = dt.substring(10, 12).toInt();
    uint8_t second = dt.substring(12, 14).toInt();

    // Validate ranges
    if (year < 2020 || year > 2100 ||
        month < 1 || month > 12 ||
        day < 1 || day > 31 ||
        hour > 23 || minute > 59 || second > 59)
    {
        Serial.println(F("Invalid datetime values"));
        ble_send_error("T", "Invalid values");
        return;
    }

    session_metadata* m = &werg_device->session_meta;
    m->year = year;
    m->month = month;
    m->day = day;
    m->hour = hour;
    m->minute = minute;
    m->second = second;
    m->session_start_ms = millis();
    werg_device->datetime_set = true;

    // Format time string for ACK
    char timeStr[20];
    snprintf(timeStr, sizeof(timeStr), "%04d-%02d-%02d %02d:%02d",
             year, month, day, hour, minute);

    Serial.print(F("DateTime set: "));
    Serial.println(timeStr);
    ble_send_ack("T", timeStr);
}

// Helper function to print device status
static void printDeviceStatus(werg_unit* werg_device)
{
    // Serial output (verbose)
    Serial.println(F("=== Device Status ==="));
    Serial.print(F("Device ID: "));
    Serial.println(werg_device->devID);
    Serial.print(F("Type: "));
    Serial.println(werg_device->devType == ARM_DEV ? F("ARM") :
                   (werg_device->devType == BACK_DEV ? F("BACK") : F("NOT SET")));
    Serial.print(F("Calibrated: "));
    Serial.println(werg_device->calibrated ? F("Yes") : F("No"));
    Serial.print(F("Filter: "));
    Serial.println(fuser.isEnabled() ? F("ON (complementary)") : F("OFF (accel-only)"));
    Serial.print(F("Feedback: "));
    Serial.println(werg_device->feedback ? F("ON") : F("OFF"));
    Serial.print(F("Threshold margin: "));
    Serial.println(werg_device->threshold_margin);
    Serial.print(F("Debug output: "));
    Serial.println(werg_device->debug ? F("ON") : F("OFF"));
    Serial.print(F("SD card: "));
    Serial.println(sd_is_available() ? F("Available") : F("Not available"));
    if (werg_device->datetime_set)
    {
        Serial.print(F("DateTime set: Yes ("));
        Serial.print(werg_device->session_meta.year);
        Serial.print(F("-"));
        Serial.print(werg_device->session_meta.month);
        Serial.print(F("-"));
        Serial.print(werg_device->session_meta.day);
        Serial.println(F(")"));
    }
    else
    {
        Serial.println(F("DateTime set: No"));
    }
    if (strlen(werg_device->session_meta.subject_name) > 0)
    {
        Serial.print(F("Subject: "));
        Serial.println(werg_device->session_meta.subject_name);
    }
    Serial.println(F("====================="));

    // BLE output (compact, fits BLE characteristic)
    const char* typeStr = werg_device->devType == ARM_DEV ? "ARM" :
                          (werg_device->devType == BACK_DEV ? "BACK" : "NONE");
    char buf[128];
    snprintf(buf, sizeof(buf),
             "ACK:?:ID=%d,T=%s,C=%d,FIL=%d,FB=%d,M=%d,SD=%d,REC=%d,START=1,DROP=%lu,SE=%u,VER=4.8,INT=%u,DRV=%u,VT=1",
             werg_device->devID,
             typeStr,
             werg_device->calibrated ? 1 : 0,
             fuser.isEnabled() ? 1 : 0,
             werg_device->feedback ? 1 : 0,
             werg_device->threshold_margin,
             sd_is_available() ? 1 : 0,
             werg_device->session_active ? 1 : 0,
             (unsigned long)session_dropped_samples, SD.errorCode(),
             werg_device->myVib->vibIntensity / 10, vibrator_driver_ready() ? 1 : 0);
    ble_send_string(buf);
}

void wergInit(werg_unit* werg_device)
{
    werg_device->myVib = new vibrator;
    werg_device->imuVal = new imu_values;
    if (werg_device->myVib == nullptr || werg_device->imuVal == nullptr)
    {
        Serial.println(F("ERROR: Memory allocation failed!"));
        while (1) { delay(1000); }  // Halt on allocation failure
    }
    werg_device->calibRoll = 0;
    werg_device->calibPitch = 0;
    werg_device->calibrated = false;
    werg_device->feedback = true;
    werg_device->feedback_rest = FEEDBACK_REST;
    imuInit();
    fuserInit();
}

bool isTypeSet(werg_unit* werg_device)
{
    bool isTypeSet = false;
    type typeSet = werg_device->devType;
    if (typeSet == ARM_DEV || typeSet == BACK_DEV)
    {
        isTypeSet = true;
    }
    return isTypeSet;
}

bool isCalibrated(werg_unit* werg_device) { return werg_device->calibrated; }

void configDevIntensity(werg_unit* werg_device, uint8_t intensity)
{
    Serial.print("Configure intensity to :");
    Serial.println(intensity);
    werg_device->myVib->vibIntensity = 10 * intensity;
}

void configDevID(werg_unit* werg_device, int devID)
{
    Serial.print("Set serial number to :");
    Serial.println(devID);
    werg_device->devID = devID;
}

void configDevType(werg_unit* werg_device, type devType)
{
    Serial.print("Set device type to :");
    Serial.println(devType);
    werg_device->devType = devType;
}

void configDevCalib(werg_unit* werg_device, float calibRoll, float calibPitch, const float calibValues[3])
{
    Serial.print("Set device calib to :");
    Serial.println(calibRoll);
    Serial.println(calibPitch);
    werg_device->calibRoll = calibRoll;
    werg_device->calibPitch = calibPitch;
    savePreferencesCalib(calibRoll, calibPitch, calibValues);
    werg_device->calibrated = true;
}

// Sanity-range check for a persisted calibration record: the magic marker
// alone only proves the record has the current field layout, not that the
// values are physically plausible. accelValues (and therefore calibValues,
// see calibIMU in imu.cpp) come from LSM6DS3::readFloatAccel*(), which
// report in g, not m/s^2 - a stationary sensor reads a unit gravity vector
// regardless of mounting orientation, so its magnitude should sit close to
// 1 g. The [0.5, 1.5] g band is generous enough for normal calibration
// noise and mounting tilt while still rejecting a corrupted-but-magic-
// matching record.
bool isCalibDataSane(const flashStruct &prefs)
{
    float cx = prefs.calibValues[0];
    float cy = prefs.calibValues[1];
    float cz = prefs.calibValues[2];
    float mag = sqrt(cx * cx + cy * cy + cz * cz);
    if (mag < 0.5f || mag > 1.5f)
    {
        return false;
    }
    if (fabs(prefs.calibRoll) > 180.0f || fabs(prefs.calibPitch) > 180.0f)
    {
        return false;
    }
    return true;
}

// Restore a previously persisted calibration at boot, without a redundant
// flash write (going through configDevCalib/savePreferencesCalib would
// re-save the identical record every boot). Only call this after
// confirming savedPrefs.calibRestoreOnBoot, savedPrefs.calibMagic ==
// CALIB_MAGIC and isCalibDataSane(savedPrefs) - see configInit() in
// main.cpp. Gyro bias is NOT restorable (never persisted, see calibIMU)
// and stays at its default (zero) until the next real calibration.
void restoreCalibFromFlash(werg_unit* werg_device, const flashStruct &savedPrefs)
{
    werg_device->imuVal->calibValues[0] = savedPrefs.calibValues[0];
    werg_device->imuVal->calibValues[1] = savedPrefs.calibValues[1];
    werg_device->imuVal->calibValues[2] = savedPrefs.calibValues[2];
    werg_device->calibRoll = savedPrefs.calibRoll;
    werg_device->calibPitch = savedPrefs.calibPitch;
    werg_device->calibrated = true;

    // Seed the complementary filter so it starts at the true mounting
    // angle instead of zero (same reasoning as calibIMU's
    // fuser->setAngles call) - needed for calcAngleArm/calcAnglesBackSide's
    // filter-ON branch to read correctly immediately after boot.
    fuser.setAngles(savedPrefs.calibPitch * DEG_TO_RAD,
                    savedPrefs.calibRoll * DEG_TO_RAD);

    Serial.println(F("Restored calibration from flash (recalibrate with C if remounted)."));
}

void fuserInit()
{
    // Initialize with 100Hz update rate and 96% gyro favoring
    // Higher gyro favoring = smoother response, less accel noise
    fuser.init(100, 0.96f, 0.96f);
    fuser.setEnabled(true); // Complementary filter enabled by default
}

void calibDevice(werg_unit* werg_device)
{
    // Reset filter state before calibration to clear old accumulated angles
    fuser.reset();
    calibIMU(werg_device, &fuser);
}

// Sample sensor and calculate angle.
void measure(werg_unit* werg_device, float* angles, bool* angle_available)
{
    unsigned long currentMillis = millis();
    if (currentMillis - previousMillis >= IMU_FREQ)
    {

        previousMillis = currentMillis;
        takeSample(werg_device, angles);
        num_of_samples++;

        if (werg_device->devType == ARM_DEV)
        {
            sum_of_angles += angles[0];
        }
        else
        {
            sum_of_angles += angles[0];
            sum_of_angles_2 += angles[1];
        }

        long currentMillisFilter = millis();
        bool feedback = false;
        // Averaging, threshold checks, angle reporting and SD logging run
        // regardless of the feedback flag - disabling feedback (N) must only
        // silence the vibration, not stop measurement or logging.
        if (currentMillisFilter - previousMillisFilter >= DEV_FREQ)
        {
            angles[0] = sum_of_angles / num_of_samples;
            if (werg_device->devType != ARM_DEV)
            {
                angles[1] = sum_of_angles_2 / num_of_samples;
                sum_of_angles_2 = 0;
            }
            sum_of_angles = 0;
            num_of_samples = 0;
            *angle_available = true;
            checkAngle(angles, werg_device, &feedback);
            previousMillisFilter = currentMillisFilter;

            // SD logging at 10Hz (every 100ms), only while a session runs
            if (werg_device->session_active &&
                currentMillisFilter - previousMillisSDLog >= SD_LOG_FREQ)
            {
                // Keep the 100 ms schedule: resetting to the 40 ms measure
                // tick would log every 120 ms (~8.3 Hz), not nominal 10 Hz.
                previousMillisSDLog += SD_LOG_FREQ;
                if (currentMillisFilter - previousMillisSDLog >= SD_LOG_FREQ)
                    previousMillisSDLog = currentMillisFilter; // no duplicate catch-up samples
                unsigned long elapsed_ms = currentMillisFilter - werg_device->session_begin;
                if (buf_fill < BUF_SIZE)
                {
                    buffers[active_buf][buf_fill].angle = angles[0];
                    buffers[active_buf][buf_fill].feedback = feedback ? 1.0f : 0.0f;
                    buffers[active_buf][buf_fill].elapsed_ms = elapsed_ms;
                    buf_fill++;
                }
                else if (!write_pending)
                {
                    // Buffer full, previous drain done — swap buffers
                    drain_count = buf_fill;
                    previousBufferDrain = millis();
                    active_buf ^= 1;
                    buf_fill = 0;
                    write_pending = true;
                    write_pos = 0;
                    // Store current sample in fresh buffer
                    buffers[active_buf][buf_fill].angle = angles[0];
                    buffers[active_buf][buf_fill].feedback = feedback ? 1.0f : 0.0f;
                    buffers[active_buf][buf_fill].elapsed_ms = elapsed_ms;
                    buf_fill++;
                }
                else
                {
                    // Never silently claim a complete validation recording.
                    session_dropped_samples++;
                    werg_device->session_active = false;
                    ble_send_error("SD", "Buffer overrun; recording stopped");
                }
            }
        }
    }
}
// Helper: write N samples from a buffer to the open session file
static bool write_samples_to_file(SessionSample* samples, int count,
                                  werg_unit* werg_device)
{
    float yellow_threshold, red_threshold;
    if (werg_device->devType == ARM_DEV)
    {
        yellow_threshold = YELLOW_LIMIT_ARM + werg_device->threshold_margin;
        red_threshold = RED_LIMIT_ARM + werg_device->threshold_margin;
    }
    else
    {
        yellow_threshold = YELLOW_LIMIT_NECK + werg_device->threshold_margin;
        red_threshold = RED_LIMIT_NECK + werg_device->threshold_margin;
    }

    for (int i = 0; i < count; i++)
    {
        vibrator_update(); // Keep warning pulse timing alive between SD stalls.
        SessionSample* sample = &samples[i];
        const char* zone = sample->angle >= red_threshold ? "red" :
                           sample->angle >= yellow_threshold ? "yellow" : "green";
        char row[96];
        String timestamp = format_elapsed_time(sample->elapsed_ms);
        // Integer formatting avoids depending on printf float support.
        // Format hundredths with integer conversions; never use %f here.
        if (!isfinite(sample->angle) || fabsf(sample->angle) > 360.0f)
        {
            session_write_error = "Invalid sensor angle";
            return false;
        }
        long hundredths = lroundf(sample->angle * 100.0f);
        unsigned long magnitude = hundredths < 0 ? -hundredths : hundredths;
        int length = snprintf(row, sizeof(row), "%lu,%s,%s%lu.%02lu,%d,%s\r\n",
                              (unsigned long)sample->elapsed_ms, timestamp.c_str(),
                              hundredths < 0 ? "-" : "", magnitude / 100, magnitude % 100,
                              (int)sample->feedback, zone);
        if (length <= 0 || length >= (int)sizeof(row))
        {
            session_write_error = "CSV formatting failed";
            return false;
        }
        // Writes are buffered; the bundled checked flush reports sync failures.
        if (session_file.write((const uint8_t*)row, length) != (size_t)length ||
            session_file.getWriteError())
        {
            vibrator_update();
            session_write_error = "SD row write failed";
            return false;
        }
        vibrator_update();
    }
    return true;
}

// Ensure session file is open and header is written
static bool ensure_file_ready(werg_unit* werg_device)
{
    if (!sd_is_available()) return false;

    if (!file_open)
    {
        vibrator_update();  // SD.open() can block — keep vibration alive
        session_file = SD.open(session_filename, FILE_WRITE);
        vibrator_update();
        if (!session_file)
        {
            Serial.println(F("Error opening session file"));
            sd_set_unavailable();
            return false;
        }
        file_open = true;
    }

    if (!header_written)
    {
        session_file.println(F("elapsed_ms,timestamp,angle,feedback,zone"));
        header_written = true;
    }

    if (!metadata_written)
    {
        if (!sd_write_metadata(werg_device)) return false;
        metadata_written = true;
    }

    if (session_file.getWriteError())
    {
        sd_set_unavailable();
        return false;
    }
    return true;
}

// Close session file and reset state (called by K command and cleanup)
void session_close_file()
{
    if (file_open)
    {
        vibrator_update();
        session_file.flush();
        vibrator_update();
        session_file.close();
        file_open = false;
    }
    header_written = false;
    metadata_written = false;
}

// Chunked write: one synchronous row per call, then return to the main loop
void session_write_chunk(werg_unit* werg_device)
{
    if (!write_pending) return;
    if (!sd_is_available())
    {
        werg_device->session_active = false;
        return;
    }

    if (!ensure_file_ready(werg_device))
    {
        werg_device->session_active = false;
        ble_send_error("SD", "Cannot prepare SD file");
        return;
    }

    int drain = active_buf ^ 1; // the OTHER buffer
    int end = write_pos + WRITE_CHUNK;
    if (end > drain_count) end = drain_count;

    if (!write_samples_to_file(&buffers[drain][write_pos], end - write_pos,
                               werg_device))
    {
        sd_set_unavailable();
        werg_device->session_active = false;
        session_close_file();
        ble_send_error("SD", session_write_error);
        return;
    }
    write_pos = end;

    if (write_pos >= drain_count)
    {

        // Flush once per drained buffer (normally ~1 s of data). Without it the FAT
        // directory entry is only updated on close(), so a power loss
        // mid-shift would leave a 0-byte file. Costs one controlled stall
        // per drain; vibrator_update() keeps the motor pattern alive.
        vibrator_update();
        session_file.flush();
        vibrator_update();

        if (session_file.getWriteError())
        {
            Serial.println(F("SD write error - stopping session logging"));
            session_file.close();
            file_open = false;
            header_written = false;
            metadata_written = false;
            sd_set_unavailable();
            werg_device->session_active = false;
            char error[48];
            snprintf(error, sizeof(error), "Sync failed (code=%u,data=%u)", SD.errorCode(), SD.errorData());
            ble_send_error("SD", error);
            return;
        }
        write_pending = false; // Release this buffer only after checked sync.
        Serial.println(F("Buffer drained to SD"));
    }
}

// Stop session: flush remaining active buffer, close file (used by K command)
bool store_session(werg_unit* werg_device)
{
    if (!sd_is_available() || !session_initialized) return false;

    // First finish any pending drain
    while (write_pending)
    {
        session_write_chunk(werg_device);
        if (!sd_is_available()) return false;
    }

    // Write remaining samples from active buffer
    if (buf_fill > 0)
    {
        if (!ensure_file_ready(werg_device)) return false;

        if (!write_samples_to_file(&buffers[active_buf][0], buf_fill, werg_device))
        {
            sd_set_unavailable();
            session_close_file();
            return false;
        }
    }

    // Check the final partial buffer and flush, not just full buffer drains.
    if (file_open)
    {
        session_file.flush();
        if (session_file.getWriteError())
        {
            sd_set_unavailable();
            session_close_file();
            return false;
        }
    }
    buf_fill = 0; // Keep RAM samples on failed final sync.
    session_close_file();
    if (session_dropped_samples) return false;
    Serial.println(F("Session data saved to SD"));
    return true;
}

// Check if session buffer needs draining (called from main loop)
bool session_save_needed()
{
    return sd_is_available() && (write_pending ||
        (buf_fill > 0 && millis() - previousBufferDrain >= 1000));
}

// True if the current session has an open file or unsaved samples
static bool session_has_pending_data()
{
    return file_open || write_pending || buf_fill > 0;
}

// Discard buffer state so a new session starts clean
static void session_reset_buffers()
{
    buf_fill = 0;
    active_buf = 0;
    write_pending = false;
    write_pos = 0;
    drain_count = 0;
    previousBufferDrain = millis();
}

// Save old rows with their original type/thresholds BEFORE reconfiguration.
static bool session_finish_before_reconfigure(werg_unit* device)
{
    device->session_active = false;
    if (!session_has_pending_data()) return true;
    return store_session(device);
}

// Start SD recording without touching calibration, device type or fusion state.
static bool session_start_sd(werg_unit* device)
{
    device->session_active = false;
    if (!sd_is_available()) return false;
    if (session_has_pending_data() && !store_session(device)) return false;
    session_close_file();
    session_initialized = false;
    if (!sd_create_session_files(device->session_meta.subject_name)) return false;
    session_reset_buffers();
    session_dropped_samples = 0;
    device->session_begin = millis();
    previousMillisSDLog = device->session_begin;
    session_metadata* m = &device->session_meta;
    m->session_start_ms = device->session_begin;
    m->threshold_margin = device->threshold_margin;
    m->filter_enabled = fuser.isEnabled();
    m->gyro_favoring = fuser.getConfig().pitchFavoring;
    bool arm = device->devType == ARM_DEV;
    m->threshold_yellow = (arm ? YELLOW_LIMIT_ARM : YELLOW_LIMIT_NECK) + device->threshold_margin;
    m->threshold_red = (arm ? RED_LIMIT_ARM : RED_LIMIT_NECK) + device->threshold_margin;
    // Create, write metadata/header and checked-flush before acknowledging readiness.
    if (!ensure_file_ready(device))
    {
        session_close_file();
        return false;
    }
    session_file.flush();
    if (session_file.getWriteError())
    {
        sd_set_unavailable();
        session_close_file();
        return false;
    }
    session_initialized = true;
    device->session_active = true;
    return true;
}

// Handle session save at a safe point in main loop
// Bounded row count per call; actual SD latency is card-dependent
void session_handle_save(werg_unit* werg_device)
{
    if (!write_pending && buf_fill > 0 && sd_is_available())
    {
        // Persist partial buffers every second, retaining spare capacity for
        // slow cards. The active buffer remains independent of this drain.
        drain_count = buf_fill;
        active_buf ^= 1;
        buf_fill = 0;
        write_pos = 0;
        write_pending = true;
        previousBufferDrain = millis();
    }
    if (write_pending) session_write_chunk(werg_device);
}

// Sample sensor.
void takeSample(werg_unit* werg_device, float* angles)
{
    if (werg_device->devType == ARM_DEV)
    {
        getAngleArm(werg_device, angles);
    }
    else
    {
        getAngleBack(werg_device, angles);
    }
}

// Sample the sensor and update the value in the app.
static void getAngleArm(werg_unit* werg_device, float* angles)
{
    // get values from IMU.
    getIMUaccel(werg_device);
    getIMUgyro(werg_device);
    // calculate angle.
    float angle = calcAngleArm(werg_device);
    // write angle to app.
    angles[0] = angle;
}

static void getAngleBack(werg_unit* werg_device, float* angles)
{
    // get values from IMU.
    getIMUaccel(werg_device);
    getIMUgyro(werg_device);
    // Both angles from ONE filter update - calling the filter twice on the
    // same sample would integrate the gyro twice and double the accel
    // correction (halving the effective time constant vs. ARM mode).
    calcAnglesBackSide(werg_device, &angles[0], &angles[1]);
}

static float calcAngleArm(werg_unit* werg_device)
{
    // Arm elevation angle: angle between upper arm vector and vertical line
    // Reference: PEROSH "Assessing Arm Elevation at Work with Technical Systems"

    if (fuser.isEnabled())
    {
        // Use complementary filter for accurate angles during rapid movements
        // Filter fuses gyro (good for fast changes) with accel (no drift)
        ThreeAxis accelerometer;
        ThreeAxis gyroscope;
        FusedAngles fusedAngles;

        accelerometer.x = werg_device->imuVal->accelValues[0];
        accelerometer.y = werg_device->imuVal->accelValues[1];
        accelerometer.z = werg_device->imuVal->accelValues[2];

        // Convert gyro from deg/s to rad/s (LSM6DS3 outputs deg/s)
        // Note: DEG_TO_RAD is defined in Arduino's Common.h
        gyroscope.x = werg_device->imuVal->gyroValues[0] * DEG_TO_RAD;
        gyroscope.y = werg_device->imuVal->gyroValues[1] * DEG_TO_RAD;
        gyroscope.z = werg_device->imuVal->gyroValues[2] * DEG_TO_RAD;

        fuser.getFilteredAngles(accelerometer, gyroscope, &fusedAngles, UNIT_RADIANS);

        // Exact cone angle between the fused gravity direction and the
        // calibrated one. For this pitch/roll convention sin(pitch) = -gx
        // and sin(roll) = gy hold exactly, so the unit gravity vector can
        // be reconstructed from the filtered angles. The previous
        // sqrt(pitch_delta^2 + roll_delta^2) approximation was exact only
        // for pure forward/side raises and under-read diagonal raises by
        // ~7 deg at 60 deg elevation (limitation: elevations beyond 90 deg
        // read as their mirror below 90, same as before).
        float sp = sin(fusedAngles.pitch);
        float sr = sin(fusedAngles.roll);
        float gz2 = 1.0f - sp * sp - sr * sr;
        float gx = -sp;
        float gy = sr;
        float gz = gz2 > 0 ? sqrt(gz2) : 0;

        float sp0 = sin(werg_device->calibPitch * DEG_TO_RAD);
        float sr0 = sin(werg_device->calibRoll * DEG_TO_RAD);
        float gz02 = 1.0f - sp0 * sp0 - sr0 * sr0;
        float gx0 = -sp0;
        float gy0 = sr0;
        float gz0 = gz02 > 0 ? sqrt(gz02) : 0;

        float dot = gx * gx0 + gy * gy0 + gz * gz0;
        if (dot > 1.0f) dot = 1.0f;
        if (dot < -1.0f) dot = -1.0f;
        return acos(dot) * (180.0f / M_PI);
    }
    else
    {
        // Accelerometer-only: cone angle formula
        // Valid for static postures and slow movements
        // Calculates rotation angle from calibrated gravity vector
        double x = werg_device->imuVal->accelValues[0] -
                   werg_device->imuVal->calibValues[0];
        double y = werg_device->imuVal->accelValues[1] -
                   werg_device->imuVal->calibValues[1];
        double z = werg_device->imuVal->accelValues[2] -
                   werg_device->imuVal->calibValues[2];

        // |diff| = 2*sin(θ/2) for unit vectors rotated by θ
        double I = sqrt(x * x + y * y + z * z);
        if (I > 2) I = 2;

        float angle = 2 * asin(I / 2);
        return abs(angle) * 180.0 / M_PI;
    }
}

// Calculate the torso inclination to the back (forward/backward bending)
// and to the side (lateral bending) from a single filter update.
//
// Calculation is dependant on device placement (i.e pitch and roll change
// depending on IMU placement) Current formula is for device placed with plug
// reception upwards (i.e vibrator at the bottom)
static void calcAnglesBackSide(werg_unit* werg_device, float* angleBack,
                               float* angleSide)
{
    if (fuser.isEnabled())
    {
        // Use complementary filter for accurate angles during rapid movements
        ThreeAxis accelerometer;
        ThreeAxis gyroscope;
        FusedAngles fusedAngles;

        accelerometer.x = werg_device->imuVal->accelValues[0];
        accelerometer.y = werg_device->imuVal->accelValues[1];
        accelerometer.z = werg_device->imuVal->accelValues[2];

        // Convert gyro from deg/s to rad/s (LSM6DS3 outputs deg/s)
        // Note: DEG_TO_RAD is defined in Arduino's Common.h
        gyroscope.x = werg_device->imuVal->gyroValues[0] * DEG_TO_RAD;
        gyroscope.y = werg_device->imuVal->gyroValues[1] * DEG_TO_RAD;
        gyroscope.z = werg_device->imuVal->gyroValues[2] * DEG_TO_RAD;

        fuser.getFilteredAngles(accelerometer, gyroscope, &fusedAngles,
                                UNIT_DEGREES);

        // Trunk forward/backward bending = pitch deviation from calibration
        *angleBack = abs(fusedAngles.pitch - werg_device->calibPitch);
        // Side bending = roll deviation from calibrated position
        *angleSide = abs(fusedAngles.roll - werg_device->calibRoll);
    }
    else
    {
        // Accelerometer-only: calculate pitch/roll from gravity vector
        // Valid for static postures and slow movements
        float ax = werg_device->imuVal->accelValues[0];
        float ay = werg_device->imuVal->accelValues[1];
        float az = werg_device->imuVal->accelValues[2];

        // Pitch = rotation around lateral axis (forward/backward tilt)
        float pitchFromAccel = atan2(-ax, sqrt(ay * ay + az * az));
        // Roll = rotation around longitudinal axis (side tilt)
        float rollFromAccel = atan2(ay, sqrt(ax * ax + az * az));

        // Subtract calibration to get deviation from neutral posture
        *angleBack = abs(pitchFromAccel * (180.0f / M_PI) -
                         werg_device->calibPitch);
        *angleSide = abs(rollFromAccel * (180.0f / M_PI) -
                         werg_device->calibRoll);
    }
}

// Check if the angle is between or above the critical values and trigger a
// warning if neccessary.
void checkAngle(float* angles, werg_unit* werg_device, bool* feedback)
{
    // Explicit test is independent of posture; always bounded by its timer.
    if (vibrator_test_active()) return;
    unsigned long currentMillis = millis();
    bool dbg = werg_device->debug; // gate 25 Hz prints (E/Q commands)
    if (dbg) Serial.print(F("Check angle limits: "));
    unsigned long now = millis();
    // This way we try to prevent triggering a yellow warning every time we move
    // fast from red to green.
    bool transition_over = false;
    if ((now - last_feedback_red_warning > TRANSITION_TIME_DOWN) &&
        (now - last_feedback_green > TRANSITION_TIME_UP))
    {
        transition_over = true;
        // Serial.println(now-last_feedback_red_warning);
        // Serial.println(now-last_feedback_green);
    }
    if (werg_device->devType == ARM_DEV)
    {
        float angle = angles[0];
        float threshold_yellow = YELLOW_LIMIT_ARM + werg_device->threshold_margin;
        float threshold_red = RED_LIMIT_ARM + werg_device->threshold_margin;
        if (angle > threshold_yellow && angle < threshold_red &&
            transition_over)
        {
            if (dbg)
            {
                Serial.println(angle);
                Serial.println(F("Yellow warning."));
            }
            if (werg_device->feedback)
            {
                if (now - last_feedback_yellow_warning >=
                    werg_device->feedback_rest)
                {
                    warning(werg_device->myVib);
                    last_feedback_yellow_warning = millis();
                }
                *feedback = true;
            }
        }
        else if (angle >= threshold_red)
        {
            if (dbg)
            {
                Serial.println(angle);
                Serial.println(F("Red warning."));
            }
            if (werg_device->feedback)
            {
                if (now - last_feedback_red_warning >=
                    werg_device->feedback_rest)
                {
                    alert(werg_device->myVib);
                    last_feedback_red_warning = millis();
                }
                *feedback = true;
            }
        }
        else if (angle < threshold_yellow)
        {
            if (dbg)
            {
                Serial.println(angle);
                Serial.println(F("No warning."));
            }
            noVib();
            last_feedback_green = millis();
        }
        else
        {
            noVib();
        }
    }
    else if (werg_device->devType == BACK_DEV)
    {
        float angleBack = angles[0];
        float angleSide = angles[1];
        float threshold_yellow  = YELLOW_LIMIT_NECK + werg_device->threshold_margin;
        float threshold_red = RED_LIMIT_NECK + werg_device->threshold_margin;

        if (angleBack > threshold_yellow && angleBack < threshold_red &&
            transition_over)
        {
            if (dbg)
            {
                Serial.println(angleBack);
                Serial.println(F("Yellow warning."));
            }
            if (werg_device->feedback)
            {
                if (now - last_feedback_yellow_warning >=
                    werg_device->feedback_rest)
                {
                    warning(werg_device->myVib);
                    last_feedback_yellow_warning = millis();
                }
                *feedback = true;
            }
        }
        else if (angleBack >= threshold_red)
        {
            if (dbg)
            {
                Serial.println(angleBack);
                Serial.println(F("Red warning."));
            }
            if (werg_device->feedback)
            {
                if (now - last_feedback_red_warning >=
                    werg_device->feedback_rest)
                {
                    alert(werg_device->myVib);
                    last_feedback_red_warning = millis();
                }
                *feedback = true;
            }
        }

        // Comment back on to check the side angle.
        //
        // else if (angleSide >= YELLOW_LIMIT_SIDE && angleSide < RED_LIMIT_SIDE &&
        //          transition_over)
        // {
        //     Serial.println(angleSide);
        //     Serial.println("Yellow warning.");
        //     if (now - last_feedback_yellow_warning >=
        //         werg_device->feedback_rest)
        //     {
        //         warning(werg_device->myVib);
        //         last_feedback_yellow_warning = millis();
        //     }
        // }
        // else if (angleSide >= RED_LIMIT_SIDE)
        // {
        //     Serial.println(angleSide);
        //     Serial.println("Red warning.");
        //     if (now - last_feedback_red_warning >= werg_device->feedback_rest)
        //     {
        //         alert(werg_device->myVib);
        //         last_feedback_red_warning = millis();
        //     }
        // }
        else
        {
            if (dbg)
            {
                Serial.print(F("Trunk: "));
                Serial.println(angleBack);
                // Serial.print("Bent: ");
                // Serial.println(angleSide);
                Serial.println(F("No warning."));
            }
            noVib();
        }
    }
}

void parseCommand(const String readString, werg_unit* werg_device)
{
    if (readString == RED)
    {
        alert(werg_device->myVib);
        ble_send_ack("r", "Red alert");
    }
    else if (readString == YELLOW)
    {
        warning(werg_device->myVib);
        ble_send_ack("y", "Yellow warning");
    }
    else if (readString == STRONG)
    {
        savePreferences(STRONG_VIB);
        configDevIntensity(werg_device, STRONG_VIB);
        ble_send_ack("S", "Strong");
    }
    else if (readString == MEDIUM)
    {
        savePreferences(MEDIUM_VIB);
        configDevIntensity(werg_device, MEDIUM_VIB);
        ble_send_ack("M", "Medium");
    }
    else if (readString == WEAK)
    {
        savePreferences(WEAK_VIB);
        configDevIntensity(werg_device, WEAK_VIB);
        ble_send_ack("W", "Weak");
    }
    else if (readString == CALIB)
    {
        if (isTypeSet(werg_device))
        {
            if (!session_finish_before_reconfigure(werg_device))
            {
                ble_send_error("C", "Previous SD session save failed");
                return;
            }
            werg_device->calibrated = false;
            calibDevice(werg_device);
            werg_device->calibrated = true;
            // Discard pre-calibration averaging samples, not the fusion state.
            sum_of_angles = sum_of_angles_2 = 0;
            num_of_samples = 0;
            previousMillis = previousMillisFilter = millis();

            if (sd_is_available())
            {
                if (!session_start_sd(werg_device))
                {
                    ble_send_error("C", "Calibrated but SD start failed");
                    return;
                }
            }
            else
            {
                // Keep legacy calibration/measurement use without an SD card.
                werg_device->session_active = false;
                werg_device->session_begin = millis();
            }

            Serial.print(F("Session begin: "));
            Serial.println(werg_device->session_begin);
            ble_send_ack("C", "Calibrated");
        }
        else
        {
            Serial.println(F("Select device type first. 'A' for arm and 'B' for back"));
            ble_send_error("C", "Set device type first");
        }
    }
    else if (readString == ARM)
    {
        if (!session_finish_before_reconfigure(werg_device))
        {
            ble_send_error("A", "Previous SD session save failed");
            return;
        }
        werg_device->devType = ARM_DEV;
        savePreferencesType(ARM_DEV);
        werg_device->calibrated = false;
        Serial.println("Device placed on arm. Calibrate device");
        ble_send_ack("A", "ARM");
    }
    else if (readString == BACK)
    {
        if (!session_finish_before_reconfigure(werg_device))
        {
            ble_send_error("B", "Previous SD session save failed");
            return;
        }
        werg_device->devType = BACK_DEV;
        savePreferencesType(BACK_DEV);
        werg_device->calibrated = false;
        Serial.println("Device placed on back. Calibrate device");
        ble_send_ack("B", "TRUNK");
    }
    else if (readString == "VIBTEST:PULSE" || readString == "VIBTEST:STEADY")
    {
        if (werg_device->session_active)
            ble_send_error("VIBTEST", "Stop SD recording before motor test");
        else if (!vibrator_test(werg_device->myVib, readString == "VIBTEST:PULSE"))
            ble_send_error("VIBTEST", "Vibration driver not detected");
        else
            ble_send_ack("VIBTEST", "Running; auto stop within 1.3 seconds");
    }
    else if (readString == FEEDBACK_ON)
    {
        werg_device->feedback = true;
        Serial.println("Enable feedback.");
        ble_send_ack("F", "ON");
    }
    else if (readString == FEEDBACK_OFF)
    {
        werg_device->feedback = false;
        // Stop the motor now - with feedback off nothing else would ever
        // turn it off (a red alert stays energized until the green branch
        // of checkAngle runs, and that used to be gated on this flag).
        noVib();
        Serial.println("Disable feedback.");
        ble_send_ack("N", "OFF");
    }
    else if (readString == START_RECORDING)
    {
        if (!werg_device->calibrated || !isTypeSet(werg_device))
            ble_send_error("START", "Calibrate and set body position first");
        else if (werg_device->session_active)
            ble_send_error("START", "Already recording; stop first");
        else if (vibrator_test_active())
            ble_send_error("START", "Motor test still running");
        else if (!session_start_sd(werg_device))
            ble_send_error("START", "SD start failed");
        else
            ble_send_ack("START", session_filename);
    }
    else if (readString == STOP)
    {
        werg_device->feedback = false;
        werg_device->session_active = false;
        noVib();
        if (sd_is_available() && store_session(werg_device))
        {
            ble_send_ack("K", session_filename);
        }
        else
        {
            ble_send_error("K", "Stopped; SD save failed or samples lost");
        }
    }

    // Threshold margins
    else if (readString == PLUS_5)
    {
        Serial.println("Adjust threshold margin : +5.");
        werg_device->threshold_margin = 5;
        ble_send_ack("J", "+5");
    }
    else if (readString == PLUS_10)
    {
        Serial.println("Adjust threshold margin : +10.");
        werg_device->threshold_margin = 10;
        ble_send_ack("P", "+10");
    }
    else if (readString == PLUS_15)
    {
        Serial.println("Adjust threshold margin : +15.");
        werg_device->threshold_margin = 15;
        ble_send_ack("L", "+15");
    }
    else if (readString == MINUS_5)
    {
        Serial.println("Adjust threshold margin : -5.");
        werg_device->threshold_margin = -5;
        ble_send_ack("G", "-5");
    }
    else if (readString == MINUS_10)
    {
        Serial.println("Adjust threshold margin : -10.");
        werg_device->threshold_margin = -10;
        ble_send_ack("H", "-10");
    }
    else if (readString == MINUS_15)
    {
        Serial.println("Adjust threshold margin : -15.");
        werg_device->threshold_margin = -15;
        ble_send_ack("I", "-15");
    }
    else if (readString == NO_MARGIN)
    {
        Serial.println(F("Adjust threshold margin : 0."));
        werg_device->threshold_margin = 0;
        ble_send_ack("O", "0");
    }

    // Filter control commands
    else if (readString == FILTER_ON)
    {
        fuser.setEnabled(true);
        Serial.println(F("Filter: ON (complementary)"));
        ble_send_ack("X", "ON");
    }
    else if (readString == FILTER_OFF)
    {
        fuser.setEnabled(false);
        Serial.println(F("Filter: OFF (accelerometer only)"));
        ble_send_ack("Z", "OFF");
    }

    // Debug output control
    else if (readString == DEBUG_ON)
    {
        werg_device->debug = true;
        Serial.println(F("Debug output: ON"));
        ble_send_ack("E", "ON");
    }
    else if (readString == DEBUG_OFF)
    {
        werg_device->debug = false;
        Serial.println(F("Debug output: OFF"));
        ble_send_ack("Q", "OFF");
    }

    // Calibration-restore-on-boot toggle (persisted preference, default OFF)
    else if (readString == CALIB_RESTORE_ON)
    {
        werg_device->calibRestoreOnBoot = true;
        savePreferencesCalibRestore(true);
        switchCharacteristicCalibRestore.writeValue((uint8_t)1);
        Serial.println(F("Calibration-restore-on-boot: ENABLED"));
        ble_send_ack("U", "ENABLED");
    }
    else if (readString == CALIB_RESTORE_OFF)
    {
        werg_device->calibRestoreOnBoot = false;
        savePreferencesCalibRestore(false);
        switchCharacteristicCalibRestore.writeValue((uint8_t)0);
        Serial.println(F("Calibration-restore-on-boot: DISABLED"));
        ble_send_ack("Y", "DISABLED");
    }

    // DateTime command: T:YYYYMMDDHHmmss
    else if (readString.startsWith(SET_TIME_PREFIX) && readString.length() == 16)
    {
        parseDateTime(readString.substring(2), werg_device);
    }

    // Session name command: N:subject_name (max 16 chars)
    else if (readString.startsWith(SET_SESSION_PREFIX) && readString.length() <= 18)
    {
        String name = readString.substring(2);
        if (name.length() > 0)
        {
            strncpy(werg_device->session_meta.subject_name, name.c_str(), 16);
            werg_device->session_meta.subject_name[16] = '\0';
            Serial.print(F("Subject set: "));
            Serial.println(werg_device->session_meta.subject_name);
            ble_send_ack("N", werg_device->session_meta.subject_name);
        }
        else
        {
            ble_send_error("N", "Empty name");
        }
    }

    // Text note command: NOTE:free text - appended to the session metadata
    // file with an elapsed-time tag, so users can annotate a recording
    // (e.g. "patient reported discomfort") without touching the CSV data.
    else if (readString.startsWith(NOTE_PREFIX))
    {
        String text = readString.substring(strlen(NOTE_PREFIX));
        text.trim();
        if (text.length() == 0)
        {
            ble_send_error("NOTE", "Empty text");
        }
        else if (!sd_is_available())
        {
            ble_send_error("NOTE", "SD not available");
        }
        else
        {
            uint32_t elapsed = werg_device->session_active
                ? (uint32_t)(millis() - werg_device->session_begin) : 0;
            if (sd_append_note(elapsed, text.c_str()))
            {
                Serial.print(F("Note saved @"));
                Serial.print(elapsed);
                Serial.print(F("ms: "));
                Serial.println(text);
                ble_send_ack("NOTE", "Saved");
            }
            else
            {
                ble_send_error("NOTE", "Write failed");
            }
        }
    }

    // Status query
    else if (readString == GET_STATUS)
    {
        printDeviceStatus(werg_device);
    }

    // Version query - returns firmware version for webapp feature detection
    else if (readString == GET_VERSION)
    {
        Serial.print(F("VERSION:"));
        Serial.println(F(FIRMWARE_VERSION));
        if (isBleConnected())
        {
            ble_send_string("VERSION:" FIRMWARE_VERSION);
        }
    }

    // SD Card file operations
    else if (readString == LIST_FILES)
    {
        Serial.println(F("Listing SD card files..."));
        sd_list_files();
    }
    else if (readString.startsWith(READ_FILE_PREFIX))
    {
        String filename = readString.substring(2);
        filename.trim();
        if (filename.length() > 0)
        {
            Serial.print(F("Reading file: "));
            Serial.println(filename);

            if (sd_file_exists(filename.c_str()))
            {
                // If this is the session file currently being written,
                // flush it first so the read sees consistent, current data
                if (file_open && filename.equals(session_filename))
                {
                    session_file.flush();
                }
                // Stream file content to Serial (and BLE if connected)
                sd_stream_file(filename.c_str(), nullptr);
            }
            else
            {
                Serial.print(F("ERROR:File not found: "));
                Serial.println(filename);
                ble_send_error("R", "File not found");
            }
        }
        else
        {
            Serial.println(F("ERROR:No filename specified"));
            ble_send_error("R", "No filename");
        }
    }
    else if (readString.startsWith(READ_META_PREFIX))
    {
        // Read metadata file for a session
        // M:S001 or M:S001.CSV will read S001_M.TXT.
        String basename = readString.substring(2);
        basename.trim();

        if (basename.length() > 0)
        {
            // Try to construct metadata filename
            char meta_filename[MAX_FILENAME_LEN];

            String lower_basename = basename;
            lower_basename.toLowerCase();

            // Check if it's already a full filename with old or new naming.
            // File::name() returns upper-case 8.3 names, so parse suffixes
            // without depending on the case received from D or Serial.
            if (lower_basename.endsWith("_m.txt") ||
                lower_basename.endsWith("_meta.txt"))
            {
                // strncpy does not terminate when the source fills the
                // buffer - an 18-char argument would leave meta_filename
                // unterminated and the later SD lookup/println reading OOB.
                strncpy(meta_filename, basename.c_str(), MAX_FILENAME_LEN - 1);
                meta_filename[MAX_FILENAME_LEN - 1] = '\0';
            }
            else if (lower_basename.endsWith(".csv"))
            {
                // Remove the extension by position so upper-case .CSV works.
                String stem = basename.substring(0, basename.length() - 4);
                String meta = stem + "_M.TXT";
                strncpy(meta_filename, meta.c_str(), MAX_FILENAME_LEN - 1);
                meta_filename[MAX_FILENAME_LEN - 1] = '\0';

                // If not found, try old naming convention
                if (!sd_file_exists(meta_filename)) {
                    meta = stem + "_META.TXT";
                    strncpy(meta_filename, meta.c_str(), MAX_FILENAME_LEN - 1);
                    meta_filename[MAX_FILENAME_LEN - 1] = '\0';
                }
            }
            else
            {
                // Assume it is an 8.3 session basename and add _M.TXT.
                snprintf(meta_filename, MAX_FILENAME_LEN, "%s_M.TXT", basename.c_str());
            }

            Serial.print(F("Reading metadata: "));
            Serial.println(meta_filename);

            if (sd_file_exists(meta_filename))
            {
                char buffer[512];
                int bytes_read = sd_read_file_to_buffer(meta_filename, buffer, sizeof(buffer));
                if (bytes_read > 0)
                {
                    Serial.println(F("META:BEGIN"));
                    Serial.print(buffer);
                    Serial.println(F("META:END"));

                    // Send via BLE if connected
                    if (isBleConnected())
                    {
                        ble_send_string("META:BEGIN");
                        ble_send_file_chunk(buffer, bytes_read, false);
                        ble_send_string("META:END");
                    }
                }
                else
                {
                    Serial.println(F("ERROR:Could not read metadata"));
                    if (isBleConnected())
                    {
                        ble_send_string("ERROR:Could not read metadata");
                    }
                }
            }
            else
            {
                Serial.print(F("ERROR:Metadata not found: "));
                Serial.println(meta_filename);
                if (isBleConnected())
                {
                    char err[64];
                    snprintf(err, sizeof(err), "ERROR:Metadata not found: %s", meta_filename);
                    ble_send_string(err);
                }
            }
        }
        else
        {
            Serial.println(F("ERROR:No filename specified"));
        }
    }

    // Delete file command: DEL:filename - deletes a data (.csv) or
    // metadata (_m.txt) file. Refused while that file is the active
    // session's file (session_active), so a running session can never be
    // deleted out from under itself.
    else if (readString.startsWith(DELETE_FILE_PREFIX))
    {
        String filename = readString.substring(4);
        filename.trim();

        if (filename.length() == 0)
        {
            Serial.println(F("ERROR:No filename specified"));
            ble_send_error("DEL", "No filename");
        }
        else if (!sd_is_available())
        {
            Serial.println(F("ERROR:SD not available"));
            if (isBleConnected())
            {
                ble_send_string("ERROR:SD not available");
            }
        }
        else if (!sd_file_exists(filename.c_str()))
        {
            Serial.print(F("ERROR:File not found: "));
            Serial.println(filename);
            ble_send_error("DEL", "File not found");
        }
        else if (werg_device->session_active &&
                 (filename.equals(session_filename) || filename.equals(metadata_filename)))
        {
            Serial.print(F("ERROR:File in use (active session): "));
            Serial.println(filename);
            ble_send_error("DEL", "Session active");
        }
        else if (sd_delete_file(filename.c_str()))
        {
            Serial.print(F("DELETED:"));
            Serial.println(filename);
            if (isBleConnected())
            {
                char msg[64];
                snprintf(msg, sizeof(msg), "DELETED:%s", filename.c_str());
                ble_send_string(msg);
            }
        }
        else
        {
            Serial.print(F("ERROR:DELETE:"));
            Serial.println(filename);
            if (isBleConnected())
            {
                char msg[64];
                snprintf(msg, sizeof(msg), "ERROR:DELETE:%s", filename.c_str());
                ble_send_string(msg);
            }
        }
    }

    else
    {
        Serial.println(F("Unknown command"));
    }
}
