# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## 2026-07-20

### Firmware Wergonic_v1 [2.1]

Version is defined in `Wergonic_v1/version.h` (`FIRMWARE_VERSION`), printed in the boot banner, and reported by the new `V` command.

#### Added

- `E`/`Q` serial+BLE commands to toggle verbose periodic debug prints (angle/zone every 500 ms, BLE send-angle). Off by default; one-shot prints (command ACKs, calibration) are unaffected.
- `V` serial+BLE command prints the firmware version (`Version: 2.1`).
- `Wergonic_v1/version.h` as the single source of truth for the firmware version string.

#### Changed

- Full command set is now: `r`/`y` (test vibrations), `S`/`M`/`W` (intensity), `C` (calibrate), `A`/`B` (arm/back), `F`/`N` (feedback on/off), `E`/`Q` (debug prints on/off), `V` (version).
- `N` (feedback off) now only silences vibration — angle measurement and BLE angle streaming continue running. `N` also stops a running vibration immediately.
- Gyro readings are converted to rad/s before being passed to the fusion filter (the LSM6DS3 reports deg/s); sensor values remain stored in deg/s elsewhere.

#### Fixed

- Saved vibration intensity (S/M/W) is now restored on boot; previously the device always booted at medium intensity, ignoring the saved preference.
- Removed a duplicate `checkAngle` call that double-triggered vibration when BLE-connected.
- Serial commands now work while BLE is connected (previously blocked).
- Fusion filter now performs exactly one update per IMU sample in BACK mode (previously 3 updates per sample).
- Fusion filter is initialized with the real 100 Hz sample rate instead of 0, removing a latent divide-by-zero if the commented-out complementary term is ever re-enabled.

#### Known limitations (unchanged)

- Complementary filter term still disabled (accel-only tilt).
- BLE angle characteristics are single bytes (whole degrees).
- Yellow-warning vibration blocks the main loop for ~600 ms.
- Calibration is saved to flash but not restored on boot (restore code is commented out).

### Web application

#### Fixed

- CSV parsers in `app.js` and `posture-viewer.html` now skip embedded header/non-numeric rows. Previously, a header row embedded inside appended multi-session SD files produced `NaN` records that corrupted session stitching and made all zone statistics `NaN`.
- Demo-data fallback file list in `config.js` corrected to files that actually exist.
- `upload.html` session-storage writes now handle `QuotaExceededError` with a visible error instead of silently opening an empty dashboard.
- Metadata values containing `=` are no longer truncated in `app.js`.
- `session-comparison-landscape.html` default demo filenames corrected (`rightarm-C04-1.csv` / `trunk-C04-1.csv`).
