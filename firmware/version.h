#ifndef VERSION_H_
#define VERSION_H_

// Single source of truth for the firmware version.
// Printed in the boot banner, returned by the V command, and used by the
// webapp for feature detection. Bump it here and record the change in
// firmware/CHANGELOG.md.
#define FIRMWARE_VERSION "4.4"

#endif // VERSION_H_
