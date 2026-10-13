# Lab validation recording (firmware 4.8)

Each sensor's SD CSV is the primary recording. Bluetooth CSV is a secondary
backup with unsigned byte angles; SD retains two decimal places. Firmware
measures at 25 Hz and schedules SD logging at nominal 10 Hz. Check actual
elapsed_ms intervals under load. Buffers normally drain every second; abrupt
power loss can still lose RAM data or the card's internal cached data.

## Build and automated checks

Target: XIAO nRF52840 Sense, Seeeduino mbed core 2.9.3. Libraries include
Arduino SD 1.3.0, ArduinoBLE and NanoBLEFlashPrefs. NanoBLEFlashPrefs emits an
architecture-label warning (mbed_nano versus mbed); verify flash restore on
hardware.

```sh
arduino-cli compile --fqbn Seeeduino:mbed:xiaonRF52840Sense --libraries /Users/yixiao/Library/Arduino15/libraries firmware
python3 firmware/test/session-recording.test.py
node tests/lab-validation.test.cjs
```

The firmware test executes production session functions and START/K branches
with fake SD failures. Tests cover calibration preservation, fresh files,
full/partial buffer drains, periodic writes, missing SD, exhausted filenames,
metadata/open/write failures and incomplete-save rejection. Browser tests
cover three-device acknowledgments, repeated trials, old firmware, missing SD,
partial-start rollback, failed-save retry and disconnect handling.

## Protocol and setup

- `?` reports type, calibration, SD, `REC`, `START=1` and `DROP`.
- `START` requires calibration, body position and healthy SD. Acknowledges
  `ACK:START:<filename>` after synchronously writing CSV header and metadata.
  Keeps calibration and fusion state. Rejects an already active session.
- `K` stops SD acquisition, drains both buffers and closes the file. Replies
  `ACK:K:<filename>` on success or `ERROR:K:<reason>` on failure/data loss.
- `C` still calibrates and starts SD recording when SD is available. Stop
  this setup session before starting a validation trial.

The page checks three sensors, sends `N:<trial_role>` and UTC
`T:YYYYMMDDHHmmss`, then START. Metadata uses LA/RA/TR suffixes. SD filenames
are numbered independently on each card. Commands and optical capture are
not hardware synchronized: align recordings using an experimental reference.
Browser elapsed time does not replace the per-device SD time.

## Physical acceptance test before experiment data collection

1. Flash 4.8 to all three boards. Set/calibrate two ARM sensors and one BACK
   sensor using existing setup tools; stop their setup sessions.
2. Pair Left Arm, Right Arm and Trunk on lab-validation.html.
   To recalibrate here, hold the reference pose and press Calibrate All
   Sensors. The page sets ARM/ARM/BACK, waits for C acknowledgments, stops
   the setup SD sessions with K, and verifies readiness before START. Verify correct
   body position, calibration and SD readiness. Old firmware or missing SD
   must prevent starting.
3. Start, verify three SD filenames, and move all sensors for >10 seconds.
   Stop and wait for all three SD-save confirmations before removing cards.
4. Inspect all CSVs: one header, monotonic elapsed_ms, expected samples,
   actual sample rate/gaps, and matching role names in metadata. Compare
   against the optical reference.
5. Repeat at least twice without calibration: new files each trial and stable
   resting angles/calibration. Also stop a <1-second trial and one mid-drain.
6. Test full/unwritable SD and removal during recording. The page must report
   failure, never successful SD save.
7. Disconnect a sensor during recording. It continues recording to SD
   standalone. The page stops reachable devices and reports its unconfirmed
   stop. Reconnect and press Stop & Save to finalize its SD file.

No firmware is flashed by these changes. Compilation and mocked tests do not
certify physical SD durability, BLE reliability or optical synchronization.

## Firmware review, 2026-10-13

Version 4.6.2 saves pending rows before C/A/B alters their calibration or
body-position context, resets pre-calibration averaging, and services vibration
between synchronous SD row writes. An SD save before any session exists is
rejected. Host failure tests cover these paths.

The XIAO mbed config disables minimal-printf floating-point formatting, but
the actual link map resolves snprintf to newlib with _svfprintf_r/_dtoa_r.
That configuration was not enough to establish the cause of the reported SD
write failure. Integer formatting remains portable; a genuine short SD write
or sync error still stops recording. Actual SD/card/power behavior needs
hardware testing. Compilation emits the existing NanoBLEFlashPrefs
architecture-label warning. No boards were flashed during this review.

## 4.7 SD stability change

The sketch bundles Arduino SD 1.3.0 with checked flush and short-write error
propagation. Rows are buffered; sync normally happens after one-second
batches. Each sync has at most three attempts with 2 ms between attempts.
A partly written row is never replayed. Pending/active RAM data is retained
on failed checkpoint/final sync. Persistent failure still stops the trial;
there is no unsafe automatic reinitialization/discard of that trial's buffers.
SD SPI is 1 MHz. Status adds SE (card error) and VER.

Build no longer needs a globally installed SD library:

```sh
arduino-cli compile --fqbn Seeeduino:mbed:xiaonRF52840Sense firmware
python3 firmware/test/sd-flush.test.py
python3 firmware/test/session-recording.test.py
```

After flashing, test >10 minutes, repeated short/long trials, real card
removal and power interruption, plus optical alignment and actual sample
intervals. Preserve existing files. For a persistent SD fault, preserve any
browser backup and inspect card seating, free space, FAT filesystem and
power before rebooting; reboot loses retained RAM buffers. Firmware cannot
guarantee physical card/media or supply health.

## Per-sensor vibration controls (4.8)

Lab cards expose feedback On/Off and Weak/Medium/Strong using existing
F/N and W/M/S commands. The chosen feedback mode is restored at each START.
Strength changes are persisted by the existing firmware preference code.

VIBTEST:PULSE and VIBTEST:STEADY test the motor independently of posture
while SD recording is stopped. The state machine stops the test at nominal
1.3 seconds; N/K cancel immediately. Motor tests are rejected during a
session, and START is rejected while a test is active. Status adds VT=1,
INT=4/6/8 and DRV=0/1. DRV=1 means the I2C driver was found, not that the
motor connection or power has been verified. Automatic feedback remains
threshold-based double-pulse yellow and steady red; the pattern selector
changes the explicit diagnostic test only.

```sh
python3 firmware/test/vibration.test.py
```

Test each sensor at Strong after stopping recording. If motor test works
but posture feedback does not, check feedback On, calibration, body position
and threshold crossing. If driver is detected but even Strong motor test
produces no movement, inspect the motor, driver output wiring and power.
Firmware 4.8 is needed for timed motor tests and driver status; existing
firmware supports strength and feedback commands. Layout has desktop and
mobile overflow checks, with only English page text.
