#include "simpleFusion.h"

SimpleFusion::SimpleFusion(void){};

/*!
 *    @brief Initializes filter parameters.
 *    @param filterUpdateRate The frequency of filter updates up to 1000000
 *Hertz
 *    @param pitchGyroFavoring The amount that the gyroscope is favored in the
 *pitch direction as a decimal percent less than 1
 * 		@param rollGyroFavoring The amount that the gyroscope is favored
 *in the roll direction as a decimal percent less than 1
 *		@returns false if any gyro favoring is an invalid value, true if
 *they are valid.
 */
bool SimpleFusion::init(int16_t filterUpdateRate, float pitchGyroFavoring,
                        float rollGyroFavoring)
{
    _filterUpdateRate = filterUpdateRate;
    _pitchGyroFavoring = pitchGyroFavoring;
    _rollGyroFavoring = rollGyroFavoring;

    if (_pitchGyroFavoring > 1 || _pitchGyroFavoring < 0)
        return false;
    if (_rollGyroFavoring > 1 || _rollGyroFavoring < 0)
        return false;

    _previousTime = millis();
    _lastUpdateTime = millis();
    _justUpdatedData = false;
    _filterEnabled = true; // Enabled by default

    _pitch = 0;
    _roll = 0;

    return true;
}

/*!
 *    @brief Allows you to update the library at the desired frequency. You
 *should update the sensor only when the library is running
 *		@returns true if it is time to update the library, false if it
 *isn't
 */
bool SimpleFusion::shouldUpdateData()
{
    unsigned long dt = (millis() - _previousTime);

    if ((dt % (1000 / _filterUpdateRate) <= DATA_UPDATE_POLL_TOLERANCE) &&
        (_justUpdatedData == false))
    {
        _justUpdatedData = true;
        return true;
    }
    else if ((dt % (1000 / _filterUpdateRate) > DATA_UPDATE_POLL_TOLERANCE))
        _justUpdatedData = false;

    return false;
};

/*!
 *    @brief Calculates rotation angles based on gyroscope and accelerometer
 * readings using a complementary filter (when enabled).
 *    @param accelerometer The accelerometer readings from the IMU as ThreeAxis
 * struct variables (Units are m/s^2)
 *    @param gyroscope The gyroscope readings from the IMU as ThreeAxis struct
 * variables (Units are radians/second)
 *    @param angleOutputs The address of a FusedAngles struct variable
 * for holding angular outputs
 */
void SimpleFusion::getFilteredAngles(ThreeAxis& accelerometer,
                                     ThreeAxis& gyroscope,
                                     FusedAngles* angleOutputs,
                                     AngleUnit angleUnit)
{
    // Calculate actual dt in seconds for proper gyro integration
    unsigned long currentTime = millis();
    float dt = (currentTime - _lastUpdateTime) / 1000.0f;
    _lastUpdateTime = currentTime;

    // Clamp dt to prevent instability on first call or after long pause
    if (dt <= 0 || dt > 0.5f)
    {
        dt = 1.0f / _filterUpdateRate;
    }

    // Calculate angles from accelerometer (use multiply instead of pow)
    float pitchFromAccel = atan2(-accelerometer.x,
        sqrt(accelerometer.y * accelerometer.y +
             accelerometer.z * accelerometer.z));
    float rollFromAccel = atan2(accelerometer.y,
        sqrt(accelerometer.x * accelerometer.x +
             accelerometer.z * accelerometer.z));

    // Apply complementary filter if enabled
    if (_filterEnabled && (_pitchGyroFavoring > 0 || _rollGyroFavoring > 0))
    {
        // Complementary filter: gyro for short-term, accel for long-term
        // gyro integration: angle += (gyro_rate - bias) * dt
        _pitch = _pitchGyroFavoring *
                     (_pitch + (gyroscope.y - _gyroBiasY) * dt) +
                 (1.0f - _pitchGyroFavoring) * pitchFromAccel;
        _roll = _rollGyroFavoring *
                    (_roll + (gyroscope.x - _gyroBiasX) * dt) +
                (1.0f - _rollGyroFavoring) * rollFromAccel;
    }
    else
    {
        // Accelerometer only (no gyro fusion)
        _pitch = pitchFromAccel;
        _roll = rollFromAccel;
    }

    // Convert to output units
    switch (angleUnit)
    {
        case UNIT_DEGREES:
            angleOutputs->pitch = _pitch * (180.0f / M_PI);
            angleOutputs->roll = _roll * (180.0f / M_PI);
            break;
        case UNIT_RADIANS:
            angleOutputs->pitch = _pitch;
            angleOutputs->roll = _roll;
            break;
    }
}

// Enable or disable the complementary filter
void SimpleFusion::setEnabled(bool enabled)
{
    _filterEnabled = enabled;
}

// Reset filter state (call on calibration to clear accumulated angles)
void SimpleFusion::reset()
{
    _pitch = 0;
    _roll = 0;
    _lastUpdateTime = millis();
    _previousTime = millis();
    _justUpdatedData = false;
}

// Seed filter state with known angles (radians)
void SimpleFusion::setAngles(float pitchRad, float rollRad)
{
    _pitch = pitchRad;
    _roll = rollRad;
    _lastUpdateTime = millis();
}

// Set gyroscope bias (rad/s), subtracted from every sample
void SimpleFusion::setGyroBias(float xBias, float yBias, float zBias)
{
    _gyroBiasX = xBias;
    _gyroBiasY = yBias;
    _gyroBiasZ = zBias;
}

// Check if complementary filter is enabled
bool SimpleFusion::isEnabled() const
{
    return _filterEnabled;
}

// Get current filter configuration
FilterConfig SimpleFusion::getConfig() const
{
    FilterConfig config;
    config.pitchFavoring = _pitchGyroFavoring;
    config.rollFavoring = _rollGyroFavoring;
    config.enabled = _filterEnabled;
    return config;
}
