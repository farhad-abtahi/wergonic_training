# Webapp Debugging Guide

## Issue: Clicking the Connect ARM Button Does Nothing

### Debugging Steps:

1. **Open browser developer tools**
   - Chrome/Edge: Press `F12` or `Right-click → Inspect`
   - Switch to the "Console" tab

2. **Check for error messages**
   The code now includes detailed logging and error capture. You should see:

   - ✅ "Wergonic App: Initializing..."
   - ✅ "Web Bluetooth API: Available"
   - ✅ "DOM elements cached successfully"
   - ✅ "Event listeners attached"
   - ✅ "Wergonic App: Initialization complete"

   If you see these logs, initialization was successful.

3. **When clicking the Connect ARM button you should see**
   - ✅ "Connect ARM button clicked"
   - A Bluetooth device selection dialog should then appear

### Possible Issues:

#### A) Browser does not support Web Bluetooth
**Symptom**: Alert saying "Web Bluetooth is not supported"
**Fix**:
- Must use Chrome or Edge browser
- Must use https:// or localhost

#### B) JavaScript error
**Symptom**: Red error message in the console
**Fix**: Note the error message including filename and line number

#### C) Button click does nothing, no "Connect ARM button clicked" in console
**Possible causes**:
1. DOM element not found
2. Event listener not attached
3. Page not fully loaded

**Check**:
```javascript
// Type in console:
elements.connectArmBtn
// Should return a <button> element, not undefined
```

#### D) Button is disabled
**Check**:
```javascript
// Type in console:
elements.connectArmBtn.disabled
// Should return false
```

### Test Commands (enter in browser console)

```javascript
// 1. Check Web Bluetooth API
navigator.bluetooth
// Should return an object, not undefined

// 2. Check elements
console.log(elements.connectArmBtn);
console.log(elements.disconnectArmBtn);

// 3. Manually trigger connection (bypassing button)
connectDevice('arm');

// 4. Check device state
console.log(devices.arm);
```

### Server Setup

#### Start a local server
```bash
cd webapp
python3 -m http.server 8000
```

#### Access URLs
- ✅ `http://localhost:8000` (Chrome/Edge)
- ✅ `http://127.0.0.1:8000` (Chrome/Edge)
- ❌ `file:///path/to/index.html` (Web Bluetooth requires https or localhost)

### Enhancements Added

1. **Detailed logging**: Console shows each initialization step
2. **Error capture**: Any JavaScript error will trigger an alert
3. **Button click logging**: Clicking a button immediately logs to console
4. **Promise error capture**: Unhandled async errors are also displayed

### Next Steps

Please:
1. Hard refresh the page (`Ctrl+Shift+R` or `Cmd+Shift+R`)
2. Open Console
3. Check initialization logs
4. Click Connect ARM
5. Screenshot or copy all console output

This will allow us to pinpoint the issue precisely!
