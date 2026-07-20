# Firmware Changelog

All notable changes to the Wergonic Vibrator firmware. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/); the version number lives in
`firmware/version.h` and is reported in the boot banner and by the `V` command
(the webapp uses it for feature detection).

## [4.3] — 2026-07-20

### Added
- Calibration-restore-on-boot, off by default, toggled via `U`/`Y` commands
  or the new BLE characteristic (UUID
  `6f2e9b1a-3c7d-4e2f-9a6b-1d8c5f0a72e3`); persists the raw calibration
  accel vector so restore is valid whether or not the complementary filter
  is enabled at boot; gyro bias is not restorable and resets to zero until
  the next calibration.

## [4.2] — 2026-07-20

### Added
- `DEL:filename` command to delete a file from the SD card (data `.csv` or
  metadata `_m.txt`/`_meta.txt`). Accepted over both Serial and BLE, same as
  `R:`/`M:`. Responds `DELETED:filename` on success. Refused with
  `ERROR:DEL:Session active` while `filename` is the active session's data
  or metadata file (`session_active == true`), so a running session can
  never be deleted out from under itself. Same `ERROR:SD not available` /
  `ERROR:File not found: filename` responses as the other file commands
  when SD is down or the file doesn't exist; `ERROR:DELETE:filename` if the
  underlying SD remove() call itself fails.
- BLE command characteristic (`switchCharacteristic`) grown from 20 to 22
  bytes so `DEL:` (4-byte prefix) plus an 18-byte filename fits, matching
  the existing headroom `R:`/`M:` (2-byte prefix) already had.

## [4.1] — 2026-07-18

Stability/accuracy release: fixes every defect from the firmware review
(`docs/FIRMWARE_REVIEW.md`) except the deferred architectural items. Compiles
on `Seeeduino:mbed:xiaonRF52840Sense` 2.9.3 with Seeed LSM6DS3 **2.0.3**
(pinned — 2.0.5 does not build on the mbed core; see the review doc's build
notes).

### Added
- `E` / `Q` commands to enable/disable verbose 25 Hz debug prints
  (angle/zone and BLE `Send angle` output). **Off by default** — one-shot
  event prints (ACKs, calibration, warnings) are unaffected. `?` status
  reports the debug state.
- `session_active` flag: SD logging now runs from calibration (`C`) until
  stop (`K`), independent of the vibration feedback flag.
- Gyro bias estimation: the stationary 5 s calibration window now also
  averages the gyroscope; the bias is subtracted inside the filter
  (`SimpleFusion::setGyroBias`).
- Per-buffer SD flush (~every 6 s) with `getWriteError()` checking — a power
  loss now costs at most one buffer of data instead of the whole session
  file, and a failing card disables SD cleanly.
- Each calibration starts a **new** session file via
  `sd_create_session_files()` (previously all sessions in one boot appended
  into the same CSV with duplicate headers).
- `version.h` as the single source of the firmware version (boot banner and
  `V` were previously inconsistent: "2.1" vs "4.0").

### Changed
- **ARM elevation (filter enabled) is now the exact cone angle** between the
  fused gravity direction and the calibrated one, replacing the
  `sqrt(pitchΔ² + rollΔ²)` approximation that under-read diagonal raises
  (−6.6° at 60° elevation; up to −17° with a tilted mounting).
  Host-simulation-verified at 0.000° max error. Expect slightly different
  (more correct) angles than 4.0 for out-of-plane movements.
- **Calibration now seeds the complementary filter** from the averaged
  gravity vector. In 4.0, calibrating with the filter enabled stored only
  ~4% of the mounting angle, leaving a baseline error of ~96% of the
  mounting angle (19.2° at a 20° mount; simulation-verified). Recalibrate
  after flashing.
- BACK mode runs **one filter update per IMU sample** (both bend angles from
  a single update). 4.0 ran the filter twice per sample, halving the
  effective smoothing time constant relative to ARM mode.
- Disabling feedback (`N`) now only silences vibration — measurement, BLE
  angle streaming, and SD logging continue (silent-monitoring mode works).
  `N` also stops a running vibration immediately.
- `noVib()` cancels the vibration pattern state machine — no more phantom
  second pulse after returning to the green zone.
- Saved vibration intensity (`S`/`M`/`W`) is restored on boot (4.0 always
  booted at medium).
- Serial command timeout reduced 1000 ms → 50 ms (no more 1 s loop stalls on
  partial input); serial commands also work while BLE is connected.
- `R:` on the actively-written session file flushes it first (consistent
  reads); vibration timing stays alive during file streaming/listing and
  calibration (`vibrator_update()` / `BLE.poll()` inside the loops).

### Fixed
- `session_begin` float → `unsigned long` (timestamps drifted after ~4.6 h
  of uptime).
- Unterminated `strncpy` in the `M:` metadata command (out-of-bounds read
  with 18-char filenames).
- Metadata filename overflow in `sd_create_session_files` (base names capped
  at 7 chars so both generated names fit the 18-byte BLE limit).
- Gyro passed in deg/s instead of rad/s during calibration.
- Docs listed `K` as the +10° margin command; it is `P` (`K` stops the
  session).

### Known limitations (unchanged)
- BLE file-transfer chunks (124 B) require the central to negotiate
  MTU ≥ 127; angle characteristics report whole degrees.
- File streaming/listing still blocks measurement for its duration
  (vibration timing is kept alive, but samples are not taken).
- Fused elevations beyond 90° read as their mirror below 90°.

## [4.0] — 2026-01-31 … 2026-02-10

- Web Bluetooth app; `V` version command for feature detection.
- SimpleFusion complementary filter (100 Hz, 0.96 gyro favoring), `X`/`Z`
  filter commands.
- Session metadata files, `T:`/`N:` datetime & subject commands.
- SD file listing/transfer over BLE and Serial (`D`, `R:`, `M:`);
  `BLEStringCharacteristic` for multi-char commands.
- Double-buffered, chunked SD logging decoupled from the feedback path;
  10 Hz log rate; non-blocking yellow-warning vibration pattern.
- `P` replaces `K` for +10° margin (collision with stop).

## [2.1] — 2025

- Arduino-based release: ARM/BACK angle monitoring with threshold-based
  haptic feedback, BLE commands, flash-persisted preferences, basic SD
  session logging, Android app (`sd_thresholds.apk`).
