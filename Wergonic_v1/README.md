# Wergonic Vibrator Device

Support for haptic device via a mobile application.

Current firmware version: **2.1** (see `version.h`, the single source of truth for the version string; printed in the boot banner and returned by the `V` serial/BLE command). See the repo-root `CHANGELOG.md` for release history.

## Use case

### Standalone

- The device can work in standalone mode when turned on by keeping the last configuration stored in flash memory. 

- The device calculates the arm angle elevation and the back's bending or twisting. 

- The device triggers a vibration to warn the user when appropriate. There is a small delay between consecutive vibrations in order to avoid annoying feedback to the user. 

### Mobile app

- The user can connect/disconnect with a device via the mobile app.

- The user has the ability to mute the device via the mobile app. 

- The user can configure the device type and intensity via the mobile app. 

- The user can observe the measured angles via the mobile app. 

## Source code walkaround

- main : initialize device and start measuring. Also advertise BLE
- config : load and store device settings from flash memory. 
- device : support for calibration, measurement and angle calculation. 
- vibrator : support for vibrator. 
- imu : support for IMU sensor. 
- ble_service : support for bluetooth communication. 
- leds : support for different led functionality. 
- simpleFusion : support for calculation of pitch/roll. Complementary filter will be added here as well. 

## Serial / BLE commands

The device accepts single-character commands over serial and BLE. Since v2.1, serial commands also work while BLE is connected (previously blocked).

| Command | Description |
|---------|-------------|
| `r` / `y` | Trigger a test vibration |
| `S` / `M` / `W` | Set vibration intensity: Soft / Medium / Strong |
| `C` | Calibrate device |
| `A` / `B` | Set device type: Arm / Back |
| `F` / `N` | Feedback on / off |
| `E` / `Q` | Verbose debug prints on / off (angle/zone every 500 ms, BLE send-angle) |
| `V` | Print firmware version (`Version: 2.1`) |

### Notes on `F`/`N` (feedback on/off)

- `N` (feedback off) only silences vibration. Angle measurement and BLE angle streaming keep running while feedback is off.
- If a vibration is already running when `N` is received, it is stopped immediately.

### Notes on `E`/`Q` (debug prints)

- Verbose periodic debug prints (angle/zone every 500 ms, BLE send-angle) are **off by default** and only appear after `E` is sent; `Q` turns them back off.
- One-shot prints — command acknowledgements, calibration output — are unaffected and always print regardless of the `E`/`Q` state.

### Notes on intensity (`S`/`M`/`W`)

The saved S/M/W vibration intensity preference is restored from flash on boot (previously the device always booted at medium intensity, ignoring the saved preference).

## Building

Build with `arduino-cli` using core `Seeeduino:mbed` 2.9.3, and these pinned libraries:

- Seeed Arduino LSM6DS3 **2.0.3** (pinned — 2.0.5 does not build on this core)
- Adafruit DRV2605 1.2.4
- NanoBLEFlashPrefs 1.2.0

Because the official `Arduino_LSM6DS3` library is also commonly installed and collides with the Seeed library on `LSM6DS3.h`, compile with an explicit `--library` path pointing at the Seeed library:

```bash
arduino-cli compile --fqbn Seeeduino:mbed:xiaonRF52840Sense --library "/Users/sabt/Documents/Arduino/libraries/Seeed_Arduino_LSM6DS3" Wergonic_v1
```

## Known limitations

- The complementary filter term is still disabled; tilt is accel-only.
- BLE angle characteristics are single bytes (whole degrees).
- The yellow-warning vibration blocks the main loop for ~600 ms.
- Calibration is saved to flash but not restored on boot (restore code is commented out).

## Flowchart for Wergonic Vib v2.0

Diagram predates the v2.1 fixes above (command set, filter timing/units, and feedback-off behavior have changed since); layout and use case remain accurate.

![Alt text](../resources/flowchartv20.png?raw=true "Title")
