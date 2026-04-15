# Wergonic Vibrator Device

Support for haptic device via a mobile application. 

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


## Flowchart for Wergonic Vib v2.0

![Alt text](../resources/flowchartv20.png?raw=true "Title")
