#include "device.h"
#include "config.h"
#include "dictionary.h"
#include "imu.h"
#include "simpleFusion.h"
#include "vibrator.h"
// Support for calculating the angle from the IMU data.

static void getAngleArm(werg_unit* werg_device, float* angles);
static void getAngleBack(werg_unit* werg_device, float* angles);
static float calcAngleArm(werg_unit* werg_device);
static float calcAngleSide(werg_unit* werg_device);
static float calcAngleBack(werg_unit* werg_device);

SimpleFusion fuser;
float alpha = 1.2;
float beta = 0.9;

long previousMillis = 0;
long previousMillisFilter = 0;
int num_of_samples = 0;    // Number of samples used to calculate average.
float sum_of_angles = 0;   // Sum of angles.
float sum_of_angles_2 = 0; // Sum of angles for back.
long last_feedback_red_warning = 0;    // Last time there was a red warning.
long last_feedback_yellow_warning = 0; // Last time there was a yellow warning.
long last_feedback_green = 0;          // Last time there was no warning.
#define FEEDBACK_REST 0 // mseconds to rest between vibrations of the same type.
#define TRANSITION_TIME_DOWN                                                   \
    500 // mseconds to account for as a transition time when going rapidly from
        // red to green and vice versa.
#define TRANSITION_TIME_UP                                                     \
    500 // mseconds to account for as a transition time when going rapidly from
        // red to green and vice versa.

const float g = 9.82;

void wergInit(werg_unit* werg_device)
{
    werg_device->myVib = new vibrator;
    werg_device->imuVal = new imu_values;
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

void configDevCalib(werg_unit* werg_device, float calibRoll, float calibPitch)
{
    Serial.print("Set device calib to :");
    Serial.println(calibRoll);
    Serial.println(calibPitch);
    werg_device->calibRoll = calibRoll;
    werg_device->calibPitch = calibPitch;
    savePreferencesCalib(calibRoll, calibPitch);
    werg_device->calibrated = true;
}

void fuserInit() { fuser.init(0, 0, 0); }

void calibDevice(werg_unit* werg_device) { calibIMU(werg_device, &fuser); }

// Sample sensor and calculate angle.
void measure(werg_unit* werg_device, float* angles, bool* angle_available)
{
    long currentMillis = millis();
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
        if (werg_device->feedback &&
            (currentMillisFilter - previousMillisFilter >= DEV_FREQ))
        {
            if (werg_device->devType == ARM_DEV)
            {
                angles[0] = sum_of_angles / num_of_samples;
                sum_of_angles = 0;
                num_of_samples = 0;
                *angle_available = true;
                checkAngle(angles, werg_device);
                previousMillisFilter = currentMillisFilter;
            }
            else
            {
                angles[0] = sum_of_angles / num_of_samples;
                angles[1] = sum_of_angles_2 / num_of_samples;
                sum_of_angles = 0;
                sum_of_angles_2 = 0;
                num_of_samples = 0;
                *angle_available = true;
                checkAngle(angles, werg_device);
                previousMillisFilter = currentMillisFilter;
            }
        }
    }
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
        float anglesBack[2];
        getAngleBack(werg_device, angles);
    }
}

// Sample the sensor and update the value in the app.
static void getAngleArm(werg_unit* werg_device, float* angles)
{
    float accelValues[3] = {0, 0, 0};
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
    float accelValues[3] = {0, 0, 0};
    // get values from IMU.
    getIMUaccel(werg_device);
    getIMUgyro(werg_device);
    // calculate angle.
    float angleBack = calcAngleBack(werg_device);
    // write angle to app.
    angles[0] = angleBack;
    float angleSide = calcAngleSide(werg_device);
    angles[1] = angleSide;
}

static float calcAngleArm(werg_unit* werg_device)
{
    // It is a bit unclear still what the proper formula is.

    double x = werg_device->imuVal->accelValues[0] -
               werg_device->imuVal->calibValues[0];
    double y = werg_device->imuVal->accelValues[1] -
               werg_device->imuVal->calibValues[1];
    double z = werg_device->imuVal->accelValues[2] -
               werg_device->imuVal->calibValues[2];

    // TODO add comp. filter here before calculating data Cone.

    double I = sqrt(pow(x, 2) + pow(y, 2) + pow(z, 2));

    if (I > 2)
    {
        I = 2;
    }

    float angle = 2 * asin(I / 2);
    return abs(angle) * 180.0 / M_PI;
}

// Calculate the torso incilation to the back.
//
// Calculation is dependant on device placement (i.e pitch and roll change
// depending on IMU placement) Current formula is for device placed with plug
// reception upwards (i.e vibrator at the bottom)
static float calcAngleBack(werg_unit* werg_device)
{
    ThreeAxis accelerometer;
    ThreeAxis gyroscope;
    FusedAngles fusedAngles;

    accelerometer.x = werg_device->imuVal->accelValues[0];
    accelerometer.y = werg_device->imuVal->accelValues[1];
    accelerometer.z = werg_device->imuVal->accelValues[2];
    gyroscope.x = werg_device->imuVal->gyroValues[0];
    gyroscope.y = werg_device->imuVal->gyroValues[1];
    gyroscope.z = werg_device->imuVal->gyroValues[2];
    fuser.getFilteredAngles(accelerometer, gyroscope, &fusedAngles,
                            UNIT_DEGREES);
    const float roll = abs(fusedAngles.roll - werg_device->calibRoll);
    const float pitch = abs(fusedAngles.pitch - werg_device->calibPitch);
    return abs(pitch - roll);
}

// Calculate the torso incilation to the side.
static float calcAngleSide(werg_unit* werg_device)
{
    ThreeAxis accelerometer;
    ThreeAxis gyroscope;
    FusedAngles fusedAngles;

    accelerometer.x = werg_device->imuVal->accelValues[0];
    accelerometer.y = werg_device->imuVal->accelValues[1];
    accelerometer.z = werg_device->imuVal->accelValues[2];
    gyroscope.x = werg_device->imuVal->gyroValues[0];
    gyroscope.y = werg_device->imuVal->gyroValues[1];
    gyroscope.z = werg_device->imuVal->gyroValues[2];
    fuser.getFilteredAngles(accelerometer, gyroscope, &fusedAngles,
                            UNIT_DEGREES);
    fuser.getFilteredAngles(accelerometer, gyroscope, &fusedAngles,
                            UNIT_DEGREES);
    const float roll = abs(fusedAngles.roll - werg_device->calibRoll);
    const float pitch = abs(fusedAngles.pitch - werg_device->calibPitch);
    return roll;
}

// Check if the angle is between or above the crticial values and trigger a
// warning if neccessary.
void checkAngle(float* angles, werg_unit* werg_device)
{
    long currentMillis = millis();
    Serial.print("Check angle limits: ");
    long now = millis();
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
        if (angle > YELLOW_LIMIT_ARM && angle < RED_LIMIT_ARM &&
            transition_over)
        {
            Serial.println(angle);
            Serial.println("Yellow warning.");
            if (now - last_feedback_yellow_warning >=
                werg_device->feedback_rest)
            {
                warning(werg_device->myVib);
                last_feedback_yellow_warning = millis();
            }
        }
        else if (angle >= RED_LIMIT_ARM)
        {
            Serial.println(angle);
            Serial.println("Red warning.");
            if (now - last_feedback_red_warning >= werg_device->feedback_rest)
            {
                alert(werg_device->myVib);
                last_feedback_red_warning = millis();
            }
        }
        else if (angle < YELLOW_LIMIT_ARM)
        {
            Serial.println(angle);
            noVib();
            last_feedback_green = millis();
            Serial.println("No warning.");
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
        if (angleBack > YELLOW_LIMIT_NECK && angleBack < RED_LIMIT_NECK &&
            transition_over)
        {
            Serial.println(angleBack);
            Serial.println("Yellow warning.");
            if (now - last_feedback_yellow_warning >=
                werg_device->feedback_rest)
            {
                warning(werg_device->myVib);
                last_feedback_yellow_warning = millis();
            }
        }
        else if (angleBack >= RED_LIMIT_NECK)
        {
            Serial.println(angleBack);
            Serial.println("Red warning.");
            if (now - last_feedback_red_warning >= werg_device->feedback_rest)
            {
                alert(werg_device->myVib);
                last_feedback_red_warning = millis();
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
            Serial.print("Trunk: ");
            Serial.println(angleBack);
            // Serial.print("Bent: ");
            // Serial.println(angleSide);
            noVib();
            Serial.println("No warning.");
        }
    }
}

void parseCommand(const String readString, werg_unit* werg_device)
{
    if (readString == RED)
    {
        alert(werg_device->myVib);
    }
    else if (readString == YELLOW)
    {
        warning(werg_device->myVib);
    }
    else if (readString == STRONG)
    {
        savePreferences(STRONG_VIB);
        configDevIntensity(werg_device, STRONG_VIB);
    }
    else if (readString == MEDIUM)
    {
        // Sample sensor and calculate angle.
        savePreferences(MEDIUM_VIB);
        configDevIntensity(werg_device, MEDIUM_VIB);
    }
    else if (readString == WEAK)
    {
        savePreferences(WEAK_VIB);
        configDevIntensity(werg_device, WEAK_VIB);
    }
    else if (readString == CALIB)
    {
        werg_device->calibrated = false;
        if (isTypeSet(werg_device))
        {
            calibDevice(werg_device);
            werg_device->calibrated = true;
        }
        else
        {
            Serial.println(
                "Select device type first. 'A' for arm and 'B' for back");
        }
    }
    else if (readString == ARM)
    {
        werg_device->devType = ARM_DEV;
        savePreferencesType(ARM_DEV);
        werg_device->calibrated = false;
        Serial.println("Device placed on arm. Calibrate device");
    }
    else if (readString == BACK)
    {
        werg_device->devType = BACK_DEV;
        savePreferencesType(BACK_DEV);
        werg_device->calibrated = false;
        Serial.println("Device placed on back. Calibrate device");
    }
    else if (readString == FEEDBACK_ON)
    {
        werg_device->feedback = true;
        Serial.println("Enable feedback.");
    }
    else if (readString == FEEDBACK_OFF)
    {
        werg_device->feedback = false;
        Serial.println("Disable feedback.");
    }
    else
    {
        Serial.println("No command we recognize.");
    }
}
