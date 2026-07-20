#ifndef SIMPLEFUSION_H_
#define SIMPLEFUSION_H_
#ifndef SIMPLE_FUSION
#define SIMPLE_FUSION

#include <Arduino.h>
#include <math.h>

// Define M_PI if not available (some platforms don't define it)
#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

#define DATA_UPDATE_POLL_TOLERANCE                                             \
    5 // The leniency of shouldUpdateData(), in microseconds

typedef struct
{
    float x;
    float y;
    float z;
} ThreeAxis;

typedef struct
{
    float roll;
    float pitch;
} FusedAngles;

typedef enum
{
    UNIT_DEGREES,
    UNIT_RADIANS
} AngleUnit;

// Filter configuration structure
typedef struct
{
    float pitchFavoring;  // 0.0-1.0, default 0.96
    float rollFavoring;   // 0.0-1.0, default 0.96
    bool enabled;         // default true
} FilterConfig;

class SimpleFusion
{

public:
    SimpleFusion();
    bool init(int16_t filterUpdateRate, float pitchGyroFavoring,
              float rollGyroFavoring);
    void getFilteredAngles(ThreeAxis& accelerometer, ThreeAxis& gyroscope,
                           FusedAngles* angleOutputs, AngleUnit angleUnit);

    bool shouldUpdateData();

    // Filter enable/disable control
    void setEnabled(bool enabled);
    bool isEnabled() const;

    // Reset filter state (call on calibration)
    void reset();

    // Seed filter state with known angles in radians (call after calibration
    // so the filter starts at the true mounting angle instead of zero)
    void setAngles(float pitchRad, float rollRad);

    // Set gyroscope bias in rad/s, subtracted from every gyro sample
    // (estimate it by averaging the gyro during the stationary calibration)
    void setGyroBias(float xBias, float yBias, float zBias);

    // Get current filter configuration
    FilterConfig getConfig() const;

private:
    int16_t _filterUpdateRate; // Hertz, less than 1000000
    float _pitchGyroFavoring;  // The amount that the gyro is favored (alpha)
    float _rollGyroFavoring;

    float _pitch;
    float _roll;

    float _gyroBiasX = 0;
    float _gyroBiasY = 0;
    float _gyroBiasZ = 0;

    unsigned long _previousTime;
    bool _justUpdatedData;

    bool _filterEnabled;           // Whether complementary filter is active
    unsigned long _lastUpdateTime; // For proper dt calculation
};

#endif

#endif // SIMPLEFUSION_H_
