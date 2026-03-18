# Wergonic Device Manager - Web App

A web-based client for configuring and managing Wergonic haptic feedback devices via Bluetooth Low Energy (BLE).

## Features

- **Device Connection**: Connect to Wergonic devices via Web Bluetooth API
- **Configuration**: Set device type, calibrate, adjust thresholds, configure filter
- **DateTime Setting**: Set device datetime from input or current time
- **Session Management**: Set session subject name, start/stop sessions
- **Live Monitoring**: View real-time angle readings and zone status
- **File Manager**: List, preview, and download session files from SD card
- **Console**: Send raw commands and view device responses

## Requirements

- **Browser**: Chrome 56+, Edge 79+, or Opera 43+ (Web Bluetooth support required)
- **HTTPS**: Web Bluetooth requires secure context (HTTPS or localhost)
- **Bluetooth**: Device with Bluetooth 4.0+ (BLE support)

## Quick Start

### Option 1: Local Server

```bash
# Using Python 3
cd webapp
python -m http.server 8000

# Or using Node.js
npx serve .
```

Then open `http://localhost:8000` in Chrome/Edge.

### Option 2: File Protocol (Limited)

Open `index.html` directly in Chrome with the flag:
```
chrome --enable-features=WebBluetoothNewPermissionsBackend
```

## Usage

### 1. Connect to Device

1. Click **Connect Device**
2. Select your Wergonic device from the browser popup
3. Wait for connection confirmation

### 2. Configure Device

- **Device Type**: Select ARM or BACK
- **Calibrate**: Click to calibrate (hold device still)
- **Feedback**: Enable/disable vibration feedback
- **Filter**: Enable complementary filter for smoother readings
- **Threshold Margin**: Adjust angle thresholds (-15 to +15 degrees)

### 3. Set Session Info

- **DateTime**: Set device time for accurate timestamps
- **Subject Name**: Enter subject/session identifier (max 16 chars)

### 4. Download Session Data

1. Click **List Files** to see available sessions
2. Click **Download** to preview and save a file
3. Click **Meta** to view session metadata

## BLE Commands

The app sends these commands to the device:

| Command | Description |
|---------|-------------|
| `A`/`B` | Set device type (ARM/BACK) |
| `C` | Calibrate device |
| `F`/`N` | Enable/disable feedback |
| `X`/`Z` | Enable/disable filter |
| `T:YYYYMMDDHHmmss` | Set datetime |
| `N:name` | Set session name |
| `D` | List SD card files |
| `R:filename` | Read file content |
| `M:filename` | Read metadata |
| `K` | Stop and save session |
| `?` | Get device status |

## BLE UUIDs

| Purpose | UUID |
|---------|------|
| Service | `34802252-7185-4d5d-b431-630e7050e8f0` |
| Command (Write) | `34802252-7185-4d5d-b431-630e7050e8f0` |
| File Transfer (Notify) | `6e400003-b5a3-f393-e0a9-e50e24dcca9e` |
| Arm Angle (Notify) | `872a73a9-ad52-47f3-8622-10e06c24c65f` |

## Troubleshooting

### "Web Bluetooth is not supported"
- Use Chrome, Edge, or Opera browser
- Enable `chrome://flags/#enable-experimental-web-platform-features` if needed

### "Connection failed"
- Ensure device is powered on and advertising
- Check that no other app is connected to the device
- Try restarting Bluetooth on your computer

### "File download incomplete"
- Large files may take time to transfer
- Check console output for actual data
- Try downloading smaller files first

## File Structure

```
webapp/
├── index.html    # Main HTML structure
├── styles.css    # Styling
├── app.js        # JavaScript logic and BLE handling
└── README.md     # This file
```

## Browser Compatibility

| Browser | Version | Support |
|---------|---------|---------|
| Chrome | 56+ | Full |
| Edge | 79+ | Full |
| Opera | 43+ | Full |
| Firefox | - | Not supported |
| Safari | - | Not supported |

## License

MIT License - Part of the Wergonic project.
