#ifndef DICTIONARY_H_
#define DICTIONARY_H_

// Define strings and values for bluetooth commands. RED and YELLOW are for the
// kind of Vibration and STRONG, MEDIUM, WEAK will define the intensity. C for
// calibration of the sensor.
#define RED (String('r'))
#define YELLOW (String('y'))
#define STRONG (String('S'))
#define MEDIUM (String('M'))
#define WEAK (String('W'))
#define CALIB (String('C'))
#define ARM (String('A'))
#define BACK (String('B'))
#define FEEDBACK_ON (String('F'))
#define FEEDBACK_OFF (String('N'))
#define STOP (String('K'))
// Threshold values
#define PLUS_5 (String('J'))
#define PLUS_10 (String('P'))  // Changed from 'K' to avoid collision with STOP
#define PLUS_15 (String('L'))
#define MINUS_5 (String('G'))
#define MINUS_10 (String('H'))
#define MINUS_15 (String('I'))
#define NO_MARGIN (String('O'))

// Filter control commands
#define FILTER_ON (String('X'))   // Enable complementary filter
#define FILTER_OFF (String('Z'))  // Disable filter (accelerometer only)

// Debug output control (25 Hz angle/zone serial prints)
#define DEBUG_ON (String('E'))    // Enable verbose serial prints
#define DEBUG_OFF (String('Q'))   // Disable verbose serial prints (quiet)

// Multi-character command prefixes
#define SET_TIME_PREFIX "T:"      // Format: T:YYYYMMDDHHmmss (14 digits after prefix)
#define SET_SESSION_PREFIX "N:"   // Format: N:subject_name (max 16 chars)

// Status query
#define GET_STATUS (String('?'))  // Request device status
#define GET_VERSION (String('V')) // Request firmware version

// SD Card file operations
#define LIST_FILES (String('D'))      // List files on SD card
#define READ_FILE_PREFIX "R:"         // Format: R:filename.csv - Read file content
#define READ_META_PREFIX "M:"         // Format: M:filename - Read metadata for session

#endif // DICTIONARY_H_
