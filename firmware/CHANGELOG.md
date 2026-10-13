# Firmware Changelog

All notable changes to the Wergonic Vibrator firmware. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/); the version number lives in
`firmware/version.h` and is reported in the boot banner and by the `V` command
(the webapp uses it for feature detection).

## [4.8] — 2026-10-13

- Add VIBTEST:PULSE / VIBTEST:STEADY for explicit stopped-session motor
  diagnosis. Auto-stop within 1.3 seconds, independent of posture thresholds.
  Reject motor tests during SD recording and START during a motor test.
- Detect DRV2605 initialization failure; expose DRV, INT and VT=1 status.
- Lab page adds per-device feedback, strength and timed pattern tests, and
  preserves each chosen feedback mode when starting a trial. Compact layout.

## [4.7] — 2026-10-13

- Bundle Arduino SD 1.3.0 inside the sketch so IDE/CLI use the same driver.
  Patched File::flush checks sync failures and retries sync three times;
  never replay ambiguous partial row writes. Short writes always set errors.
- Replace per-row O_SYNC with buffered rows and checked sync per batch
  (normally about one second), plus checked header/metadata/final sync.
- Preserve pending and active RAM buffers when synchronization fails. Never
  acknowledge a failed save or silently resume a possibly incomplete trial.
- Use conservative 1 MHz SPI for SD; report card error code/data and firmware
  version in diagnostics. Page distinguishes unavailable SD from old firmware.
- Add tests for transient/persistent sync errors and RAM retention after
  failed final and background sync. Physical reliability remains unverified.

## [4.6.2] — 2026-10-13

- Restore vibrator state updates before/after each synchronous SD row write.
- Return to the IMU/BLE loop after each SD row instead of five synchronous
  rows, reducing stalls on slow cards; SD latency remains hardware-dependent.
- Finish old SD data before C/A/B changes calibration or body position; reject
  reconfiguration on save failure, retaining original calibration/type.
- Clear old measurement averaging samples after explicit calibration.
- Reject SD save acknowledgment before any SD session was initialized.
- Review correction: the linked snprintf is newlib, including floating-point
  conversion code. The mbed minimal-printf configuration alone did not prove
  that floating-point formatting caused the observed SD failure. Integer CSV
  formatting remains for portability; actual SD write/sync errors remain fatal.

## [4.6.1] — 2026-10-13

- Removed floating-point snprintf from CSV row formatting: the XIAO mbed
  core disables minimal printf floating-point support. Format rounded angle
  hundredths with integer conversions instead; keep two decimal places.
- Distinguish CSV formatting/invalid sensor errors from real SD write/sync
  errors. Keep synchronized writes and stop on actual storage failure.

## [4.6] — 2026-10-12

- Added `START` to open a new SD session without changing calibration,
  body position, fusion state or thresholds. Requires an already calibrated
  device and a healthy SD card. An active session must be stopped first.
- Start acknowledges the CSV filename only after creating and synchronously
  writing the header and metadata. Status adds `START=1`, `REC` and `DROP`.
- Corrected the 100 ms SD schedule against the 40 ms measurement loop
  (previously reset timing yielded about 8.3 Hz instead of nominal 10 Hz).
- SD buffers normally drain every second; recording remains independent of
  BLE connectivity. Complete rows use a single `O_SYNC` write so underlying
  data/FAT sync failures propagate through the SD library's write result.
- `K` writes both pending and partial buffers and closes the file. Success
  replies `ACK:K:<filename>`; unavailable SD, write errors or buffer overrun
  reply `ERROR:K:<reason>` rather than falsely claiming a saved session.
- Added host tests for SD session control and failure paths.

## [4.5] — 2026-09-02

### Added
- `NOTE:free text` command (Serial and BLE) appends a timestamped line
  (`note_HH:MM:SS.mmm=text`) to the active session's metadata file, so
  clinicians/users can attach text annotations to a recording without
  touching the CSV data stream. Requires an SD card; responds
  `ACK:NOTE:Saved` / `ERROR:NOTE:<reason>`.
- `?` status query now also reports SD card availability (`SD=1`/`SD=0`) in
  its compact BLE reply, alongside the existing `Serial` "SD card:" line.

### Changed
- The BLE command characteristic's buffer grew from 22 to 200 bytes to fit
  the new `NOTE:` free-text command; existing commands are unaffected.

## [4.4] — 2026-07-21

### Fixed
- Session filenames now obey the DOS 8.3 limit imposed by Arduino SD 1.3.0:
  named sessions use `AB_001.CSV` / `AB_001_M.TXT` (the complete subject is
  still stored inside metadata), and unnamed sessions use
  `S001.CSV` / `S001_M.TXT`.
- The `D` file-list command, file count, filename lookup, and `M:` metadata
  suffix parsing are case-insensitive. This handles the upper-case names
  returned by `File::name()` and keeps all directory filters consistent.

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
