#ifndef DICTIONARY_H_
#define DICTIONARY_H_

// Define strings and values for bluetooth commands. RED and YELLOW are for the
// kind of Vibration and STRONG, MEDIUM, WEAK will define the intensity. C for
// calibration of the sensor.
#define RED (String('r', HEX))
#define YELLOW (String('y', HEX))
#define STRONG (String('S', HEX))
#define MEDIUM (String('M', HEX))
#define WEAK (String('W', HEX))
#define CALIB (String('C', HEX))
#define ARM (String('A', HEX))
#define BACK (String('B', HEX))
#define FEEDBACK_ON (String('F', HEX))
#define FEEDBACK_OFF (String('N', HEX))

#endif // DICTIONARY_H_
