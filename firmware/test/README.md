# Wergonic V2 Testing Guide

## Unit Tests (Future - PlatformIO + Unity)

Unit tests would go in `test/native/` directory. To set up:

1. Add PlatformIO project configuration
2. Create test files:
   - `test_fusion.cpp` - SimpleFusion filter tests
   - `test_datetime.cpp` - DateTime parsing tests
   - `test_angles.cpp` - Angle classification tests

Example test structure:
```cpp
#include <unity.h>
#include "simpleFusion.h"

void test_filter_disabled_returns_accel_only() {
    SimpleFusion fuser;
    fuser.init(100, 0.96, 0.96);
    fuser.setEnabled(false);

    ThreeAxis accel = {0, 0, 9.8};
    ThreeAxis gyro = {1.0, 1.0, 0};
    FusedAngles angles;

    fuser.getFilteredAngles(accel, gyro, &angles, UNIT_DEGREES);

    TEST_ASSERT_FLOAT_WITHIN(0.1, 0.0, angles.pitch);
}
```

## Hardware Integration Tests (Manual)

### Test 1: Filter Toggle
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Connect via BLE or Serial | Device responds |
| 2 | Send `A` (set ARM type) | "Device placed on arm" |
| 3 | Send `C` (calibrate) | "Session begin" |
| 4 | Rotate device slowly | Angle values printed |
| 5 | Send `X` (enable filter) | "Filter: ON" |
| 6 | Rotate device | Smoother angle readings |
| 7 | Send `Z` (disable filter) | "Filter: OFF" |
| 8 | Rotate device | Noisier angle readings |

### Test 2: DateTime Setting
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Send `T:20240115103000` | "DateTime set: 2024-01-15 10:30:00" |
| 2 | Send `?` (status) | Shows "DateTime set: Yes" |
| 3 | Calibrate and record | CSV timestamps correct |
| 4 | Check metadata file | Shows start_date and start_time |

### Test 3: Session Name
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Send `N:test_subject` | "Subject set: test_subject" |
| 2 | Send `?` (status) | Shows "Subject: test_subject" |
| 3 | Calibrate and stop | Metadata file shows subject name |

### Test 4: Threshold Margin
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Send `A` then `C` | Calibrate ARM device |
| 2 | Tilt to 25° | No warning (below 30° yellow) |
| 3 | Send `G` (-5° margin) | Margin set to -5 |
| 4 | Tilt to 25° | Yellow warning (now threshold is 25°) |
| 5 | Send `O` (no margin) | Margin reset to 0 |

### Test 5: Multi-Hour Recording
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Calibrate device | Session starts |
| 2 | Let run for 2+ hours | No errors |
| 3 | Check CSV timestamps | Shows 02:XX:XX.XXX format |
| 4 | Verify no timestamp wrap | No jump back to 00:00:00 |

### Test 6: Non-Blocking Vibration
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Calibrate ARM device | Ready |
| 2 | Tilt into yellow zone (30-60°) | Yellow warning vibration |
| 3 | During vibration, send `?` | Device responds immediately |
| 4 | Previous: console was blocked | Now: responsive during vibration |

### Test 7: SD Card Session Files
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Start fresh (clear SD) | `session.csv` created |
| 2 | Record and stop | Data in `session.csv` |
| 3 | Metadata in `session_meta.txt` | Contains all fields |
| 4 | Start new session | `s1.csv` and `s1_meta.txt` |

## CSV File Verification

Expected CSV format:
```csv
elapsed_ms,timestamp,angle,feedback,zone
0,00:00:00.000,15.2,0,green
100,00:00:00.100,32.5,1,yellow
3600000,01:00:00.000,28.3,0,green
```

Expected metadata format:
```
[Session Metadata]
subject=test_subject
device_type=ARM
device_id=42
start_date=2024-01-15
start_time=10:30:00
threshold_yellow=35.0
threshold_red=65.0
threshold_margin=5
filter_enabled=true
gyro_favoring=0.96
```

### Test 8: File Listing via BLE
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Connect via BLE | Device responds |
| 2 | Record a session (A, C, wait, K) | Session saved |
| 3 | Send `D` (list files) | "FILES:BEGIN" followed by file list |
| 4 | Check output | Shows session.csv and session_meta.txt with sizes |
| 5 | Output ends with | "FILES:END,N" where N is file count |

### Test 9: File Transfer via BLE
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Send `D` to list files | Get list of files |
| 2 | Send `R:session.csv` | "STREAM:BEGIN,session.csv,SIZE" |
| 3 | Receive data | CSV content in chunks |
| 4 | End marker | "<<EOF>>" then "STREAM:END" |
| 5 | Verify content | Complete CSV data received |

### Test 10: Metadata Transfer via BLE
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Send `M:session` | "META:BEGIN" |
| 2 | Receive metadata | Subject, device info, thresholds |
| 3 | End marker | "META:END" |
| 4 | Verify content | All metadata fields present |

## BLE Command Reference

| Command | Format | Description |
|---------|--------|-------------|
| `A` | Single char | Set ARM device type |
| `B` | Single char | Set BACK device type |
| `C` | Single char | Calibrate device |
| `X` | Single char | Enable complementary filter |
| `Z` | Single char | Disable filter (accel-only) |
| `T:YYYYMMDDHHmmss` | 16 chars | Set datetime |
| `N:name` | 2-18 chars | Set session subject name |
| `?` | Single char | Print device status |
| `K` | Single char | Stop and save session |
| `F` | Single char | Enable feedback |
| `J/P/L` | Single char | Increase threshold margin (+5/+10/+15) |
| `G/H/I` | Single char | Decrease threshold margin (-5/-10/-15) |
| `O` | Single char | Reset threshold margin to 0 |
| `E` | Single char | Enable verbose debug prints |
| `Q` | Single char | Disable verbose debug prints (default) |
| `D` | Single char | List files on SD card |
| `R:filename` | R: + name | Stream file content |
| `M:filename` | M: + name | Read metadata file |

## BLE File Transfer Protocol

The device uses a simple text-based protocol for file transfer:

### List Files Response
```
FILES:BEGIN
FILE:session.csv,2048
FILE:session_meta.txt,256
FILES:END,2
```

### Stream File Response
```
STREAM:BEGIN,filename,size_in_bytes
[content in chunks of ~100 bytes]
<<EOF>>
STREAM:END
```

### Metadata Response
```
META:BEGIN
[metadata content]
META:END
```

### BLE Characteristics

| UUID | Type | Purpose |
|------|------|---------|
| `34802252-7185-4d5d-b431-630e7050e8f0` | Write | Command input |
| `6e400003-b5a3-f393-e0a9-e50e24dcca9e` | Notify | File transfer output |
