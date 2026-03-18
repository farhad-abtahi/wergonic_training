/**
 * Wergonic Device Manager - Web Bluetooth Client
 * Multi-device support: ARM + TRUNK
 * Version: 2.0 with Report Feature
 */

console.log('Wergonic App v2.0 - Report Feature Loaded');

// BLE UUIDs
const WERGONIC_SERVICE_UUID = '34802252-7185-4d5d-b431-630e7050e8f0';
const COMMAND_CHARACTERISTIC_UUID = '34802252-7185-4d5d-b431-630e7050e8f0';
const FILE_TRANSFER_CHARACTERISTIC_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';
const ARM_ANGLE_CHARACTERISTIC_UUID = '872a73a9-ad52-47f3-8622-10e06c24c65f';

// Minimum firmware version for advanced features
const MIN_VERSION_ADVANCED_FEATURES = 4.0;

// Default thresholds by device type
const THRESHOLDS = {
    ARM:   { yellow: 30, red: 60 },
    TRUNK: { yellow: 20, red: 45 }
};

// Device state template
function createDeviceState() {
    return {
        device: null,
        server: null,
        service: null,
        commandCharacteristic: null,
        fileTransferCharacteristic: null,
        angleCharacteristic: null,
        fileTransferListener: null, // Save listener reference for cleanup
        actualName: null, // Actual device name read from GAP service
        isConnected: false,
        firmwareVersion: null,
        versionCheckPending: false,
        files: [],
        fileBuffer: '',
        isReceivingFile: false,
        binaryBuffer: new Uint8Array(0), // Buffer for raw binary data (Uint8Array)
        binaryHexBuffer: '', // Fallback buffer for hex string format
        isReceivingBinary: false, // Flag for binary file reception
        binaryFileSize: 0, // Expected binary file size in bytes
        currentFilename: '', // Current file being downloaded
        commandQueue: [],
        isProcessingQueue: false,
        anglePollingInterval: null,
        isCalibrated: false,
        fileCache: {} // Cache for downloaded files: {filename: content}
    };
}

// Multi-device state
const devices = {
    arm: createDeviceState(),
    trunk: createDeviceState()
};

// App state
const state = {
    debugMode: false,
    targetDevice: 'both', // 'both', 'arm', 'trunk'
    fileDevice: 'arm',    // Which device for file operations
    armYellowThreshold: 30,
    armRedThreshold: 60,
    trunkYellowThreshold: 20,
    trunkRedThreshold: 45,
    feedbackEnabled: true,
    filterEnabled: false,
    intensity: 'medium'
};

// DOM Elements
const elements = {};

// Global error handler
window.addEventListener('error', function(e) {
    console.error('Global JavaScript Error:', {
        message: e.message,
        filename: e.filename,
        lineno: e.lineno,
        colno: e.colno,
        error: e.error
    });
    alert(`JavaScript Error: ${e.message}\nFile: ${e.filename}\nLine: ${e.lineno}`);
});

// Unhandled promise rejection handler
window.addEventListener('unhandledrejection', function(e) {
    console.error('Unhandled Promise Rejection:', e.reason);
    alert(`Unhandled Error: ${e.reason}`);
});

// Initialize
document.addEventListener('DOMContentLoaded', init);

function init() {
    console.log('Wergonic App: Initializing...');
    
    // Check Web Bluetooth support
    if (!navigator.bluetooth) {
        alert('Web Bluetooth is not supported in this browser. Please use Chrome or Edge.');
        console.error('Web Bluetooth is not supported');
        return;
    }
    
    console.log('Web Bluetooth API: Available');

    // Cache DOM elements
    try {
        cacheElements();
        console.log('DOM elements cached successfully');
    } catch (e) {
        console.error('Error caching DOM elements:', e);
        alert('Error initializing app: ' + e.message);
        return;
    }

    // Debug mode toggle
    elements.debugModeToggle.addEventListener('change', toggleDebugMode);
    setDebugMode(false);

    // Connection buttons
    elements.connectArmBtn.addEventListener('click', () => {
        console.log('Connect ARM button clicked');
        connectDevice('arm');
    });
    elements.disconnectArmBtn.addEventListener('click', () => disconnectDevice('arm'));
    elements.connectTrunkBtn.addEventListener('click', () => {
        console.log('Connect TRUNK button clicked');
        connectDevice('trunk');
    });
    elements.disconnectTrunkBtn.addEventListener('click', () => disconnectDevice('trunk'));
    elements.calibrateConnectedBtn.addEventListener('click', calibrateConnectedDevices);
    elements.disconnectAllBtn.addEventListener('click', disconnectAllDevices);

    // Target device selector
    document.querySelectorAll('#targetDeviceButtons button').forEach(btn => {
        btn.addEventListener('click', () => {
            state.targetDevice = btn.dataset.target;
            document.querySelectorAll('#targetDeviceButtons button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    // Command buttons
    document.querySelectorAll('[data-cmd]').forEach(btn => {
        btn.addEventListener('click', () => {
            const cmd = btn.dataset.cmd;
            sendCommandToTarget(cmd);

            // Update UI state
            if (btn.dataset.feedback) setFeedbackState(btn.dataset.feedback === 'on');
            if (btn.dataset.filter) setFilterState(btn.dataset.filter === 'on');
            if (btn.dataset.intensity) setIntensityState(btn.dataset.intensity);

            // Handle calibration - start angle polling after
            if (cmd === 'C') {
                setTimeout(() => {
                    if (state.targetDevice === 'both' || state.targetDevice === 'arm') {
                        if (devices.arm.isConnected) {
                            devices.arm.isCalibrated = true;
                            startAnglePolling('arm');
                        }
                    }
                    if (state.targetDevice === 'both' || state.targetDevice === 'trunk') {
                        if (devices.trunk.isConnected) {
                            devices.trunk.isCalibrated = true;
                            startAnglePolling('trunk');
                        }
                    }
                }, 1000);
            }
        });
    });

    // ARM Threshold sliders
    elements.armYellowSlider.addEventListener('input', () => updateThresholdSlider('arm', 'yellow'));
    elements.armRedSlider.addEventListener('input', () => updateThresholdSlider('arm', 'red'));
    elements.applyArmThresholdsBtn.addEventListener('click', () => applyThresholds('arm'));

    // TRUNK Threshold sliders
    elements.trunkYellowSlider.addEventListener('input', () => updateThresholdSlider('trunk', 'yellow'));
    elements.trunkRedSlider.addEventListener('input', () => updateThresholdSlider('trunk', 'red'));
    elements.applyTrunkThresholdsBtn.addEventListener('click', () => applyThresholds('trunk'));

    // DateTime buttons
    elements.setDatetimeBtn.addEventListener('click', setDatetimeFromInput);
    elements.setCurrentDatetimeBtn.addEventListener('click', setCurrentDatetime);

    // Session name
    elements.setSessionNameBtn.addEventListener('click', setSessionName);

    // File operations
    elements.listFilesBtn.addEventListener('click', listFiles);
    elements.refreshFilesBtn.addEventListener('click', listFiles);

    // File device selector
    document.querySelectorAll('[data-file-device]').forEach(btn => {
        btn.addEventListener('click', () => {
            state.fileDevice = btn.dataset.fileDevice;
            document.querySelectorAll('[data-file-device]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    // Console
    elements.sendCommandBtn.addEventListener('click', sendCustomCommand);
    elements.clearConsoleBtn.addEventListener('click', clearConsole);
    elements.commandInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendCustomCommand();
    });

    // Modal
    elements.closeModalBtn.addEventListener('click', closeModal);
    elements.modalClose.addEventListener('click', closeModal);
    elements.downloadFileBtn.addEventListener('click', downloadCurrentFile);

    // Set default datetime
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    elements.datetimeInput.value = now.toISOString().slice(0, 16);

    // Initialize device section states (all disabled initially)
    updateDeviceSectionStates();

    // Set default UI state for settings
    setFeedbackState(true);
    setFilterState(false);
    setIntensityState('medium');

    logToConsole('Wergonic Device Manager ready. Connect ARM and/or TRUNK devices.', 'info');

    // ── Gamification hook ──
    if (window.GamificationSystem) {
        GamificationSystem.init();
    }
}

function cacheElements() {
    elements.debugModeToggle = document.getElementById('debugModeToggle');
    elements.consolePanel = document.getElementById('consolePanel');

    // ARM device elements
    elements.connectArmBtn = document.getElementById('connectArmBtn');
    elements.disconnectArmBtn = document.getElementById('disconnectArmBtn');
    elements.armStatusDot = document.getElementById('armStatusDot');
    elements.armDeviceName = document.getElementById('armDeviceName');
    elements.armFirmware = document.getElementById('armFirmware');
    elements.armAngleValue = document.getElementById('armAngleValue');
    elements.armZoneValue = document.getElementById('armZoneValue');

    // TRUNK device elements
    elements.connectTrunkBtn = document.getElementById('connectTrunkBtn');
    elements.disconnectTrunkBtn = document.getElementById('disconnectTrunkBtn');
    elements.trunkStatusDot = document.getElementById('trunkStatusDot');
    elements.trunkDeviceName = document.getElementById('trunkDeviceName');
    elements.trunkFirmware = document.getElementById('trunkFirmware');
    elements.trunkAngleValue = document.getElementById('trunkAngleValue');
    elements.trunkZoneValue = document.getElementById('trunkZoneValue');

    // Quick action buttons
    elements.calibrateConnectedBtn = document.getElementById('calibrateConnectedBtn');
    elements.disconnectAllBtn = document.getElementById('disconnectAllBtn');

    // ARM Threshold elements
    elements.armYellowSlider = document.getElementById('armYellowSlider');
    elements.armRedSlider = document.getElementById('armRedSlider');
    elements.armYellowValue = document.getElementById('armYellowValue');
    elements.armRedValue = document.getElementById('armRedValue');
    elements.applyArmThresholdsBtn = document.getElementById('applyArmThresholdsBtn');

    // TRUNK Threshold elements
    elements.trunkYellowSlider = document.getElementById('trunkYellowSlider');
    elements.trunkRedSlider = document.getElementById('trunkRedSlider');
    elements.trunkYellowValue = document.getElementById('trunkYellowValue');
    elements.trunkRedValue = document.getElementById('trunkRedValue');
    elements.applyTrunkThresholdsBtn = document.getElementById('applyTrunkThresholdsBtn');

    // DateTime/Session elements
    elements.datetimeInput = document.getElementById('datetimeInput');
    elements.setDatetimeBtn = document.getElementById('setDatetimeBtn');
    elements.setCurrentDatetimeBtn = document.getElementById('setCurrentDatetimeBtn');
    elements.sessionNameInput = document.getElementById('sessionNameInput');
    elements.setSessionNameBtn = document.getElementById('setSessionNameBtn');

    // File elements
    elements.listFilesBtn = document.getElementById('listFilesBtn');
    elements.refreshFilesBtn = document.getElementById('refreshFilesBtn');
    elements.fileList = document.getElementById('fileList');
    elements.downloadProgress = document.getElementById('downloadProgress');
    elements.progressFill = document.getElementById('progressFill');
    elements.progressText = document.getElementById('progressText');

    // Console elements
    elements.consoleDeviceSelect = document.getElementById('consoleDeviceSelect');
    elements.commandInput = document.getElementById('commandInput');
    elements.sendCommandBtn = document.getElementById('sendCommandBtn');
    elements.clearConsoleBtn = document.getElementById('clearConsoleBtn');
    elements.consoleOutput = document.getElementById('consoleOutput');

    // Modal elements
    elements.fileModal = document.getElementById('fileModal');
    elements.modalTitle = document.getElementById('modalTitle');
    elements.fileContent = document.getElementById('fileContent');
    elements.downloadFileBtn = document.getElementById('downloadFileBtn');
    elements.closeModalBtn = document.getElementById('closeModalBtn');
    elements.modalClose = document.getElementById('modalClose');
}

// ============ Connection ============

async function connectDevice(deviceType) {
    const deviceState = devices[deviceType];
    const deviceLabel = deviceType.toUpperCase();

    try {
        updateDeviceStatus(deviceType, 'connecting');
        logToConsole(`Scanning for ${deviceLabel} device...`, 'info');

        // Request device - Priority 1: UUID matching
        // Priority 2: Name prefix matching (fallback)
        let scanOptions;
        
        if (state.debugMode) {
            scanOptions = { acceptAllDevices: true, optionalServices: [WERGONIC_SERVICE_UUID] };
        } else {
            // Try UUID-based filtering first (more reliable)
            scanOptions = {
                filters: [{ services: [WERGONIC_SERVICE_UUID] }],
                optionalServices: [WERGONIC_SERVICE_UUID]
            };
            
            logToConsole(`Attempting UUID-based device discovery...`, 'info');
        }

        try {
            deviceState.device = await navigator.bluetooth.requestDevice(scanOptions);
            logToConsole(`Found ${deviceLabel} via UUID: ${deviceState.device.name}`, 'info');
            // Store the name from the device picker (from live advertising packet)
            deviceState.actualName = deviceState.device.name;
        } catch (uuidError) {
            // Fallback to name-based filtering
            if (!state.debugMode) {
                logToConsole(`UUID matching failed, trying name-based matching...`, 'info');
                scanOptions = {
                    filters: [{ namePrefix: 'Wergonic-' }],
                    optionalServices: [WERGONIC_SERVICE_UUID]
                };
                deviceState.device = await navigator.bluetooth.requestDevice(scanOptions);
                logToConsole(`Found ${deviceLabel} via name: ${deviceState.device.name}`, 'info');
                deviceState.actualName = deviceState.device.name;
            } else {
                throw uuidError;
            }
        }

        // Disconnect listener
        deviceState.device.addEventListener('gattserverdisconnected', () => onDeviceDisconnected(deviceType));

        // Connect to GATT server
        logToConsole(`Connecting to ${deviceLabel} GATT server (${deviceState.actualName})...`, 'info');
        deviceState.server = await deviceState.device.gatt.connect();

        // Get service
        deviceState.service = await deviceState.server.getPrimaryService(WERGONIC_SERVICE_UUID);

        // Get command characteristic
        try {
            deviceState.commandCharacteristic = await deviceState.service.getCharacteristic(COMMAND_CHARACTERISTIC_UUID);
            logToConsole(`${deviceLabel} command characteristic found`, 'info');
        } catch (e) {
            logToConsole(`${deviceLabel} command characteristic not found`, 'error');
        }

        // Get file transfer characteristic
        try {
            deviceState.fileTransferCharacteristic = await deviceState.service.getCharacteristic(FILE_TRANSFER_CHARACTERISTIC_UUID);
            await deviceState.fileTransferCharacteristic.startNotifications();
            
            // Remove old listener if exists (prevents duplicates on reconnection)
            if (deviceState.fileTransferListener) {
                deviceState.fileTransferCharacteristic.removeEventListener('characteristicvaluechanged', deviceState.fileTransferListener);
            }
            
            // Create and save new listener
            deviceState.fileTransferListener = (e) => onFileDataReceived(e, deviceType);
            deviceState.fileTransferCharacteristic.addEventListener('characteristicvaluechanged', deviceState.fileTransferListener);
            
            logToConsole(`${deviceLabel} file transfer characteristic found`, 'info');
        } catch (e) {
            logToConsole(`${deviceLabel} file transfer not available`, 'info');
        }

        // Get angle characteristic (for polling - firmware doesn't support notifications)
        try {
            deviceState.angleCharacteristic = await deviceState.service.getCharacteristic(ARM_ANGLE_CHARACTERISTIC_UUID);
            logToConsole(`${deviceLabel} angle characteristic found (polling mode)`, 'info');
        } catch (e) {
            logToConsole(`${deviceLabel} angle characteristic not available`, 'info');
        }

        // Update state
        deviceState.isConnected = true;
        updateDeviceStatus(deviceType, 'connected');
        updateDeviceInfo(deviceType);
        updateConnectionButtons();

        logToConsole(`${deviceLabel} connected successfully!`, 'received');

        // Set device type, check firmware version, and apply default settings
        setTimeout(async () => {
            // Set the device type on the firmware
            const typeCmd = deviceType === 'arm' ? 'A' : 'B';
            await sendCommand(deviceType, typeCmd);
            await new Promise(r => setTimeout(r, 200));
            checkFirmwareVersion(deviceType);
            // Apply default settings to device
            await new Promise(r => setTimeout(r, 400));
            await sendCommand(deviceType, 'Z'); // Disable complementary filter
            await new Promise(r => setTimeout(r, 100));
            await sendCommand(deviceType, 'M'); // Medium vibration intensity
            await new Promise(r => setTimeout(r, 100));
            await sendCommand(deviceType, 'F'); // Enable feedback
            logToConsole(`Default settings applied to ${deviceType.toUpperCase()}: filter OFF, intensity medium, feedback ON`, 'info');
        }, 800);

    } catch (error) {
        logToConsole(`${deviceLabel} connection failed: ${error.message}`, 'error');
        updateDeviceStatus(deviceType, 'disconnected');
    }
}

function disconnectDevice(deviceType) {
    const deviceState = devices[deviceType];
    if (deviceState.device && deviceState.device.gatt.connected) {
        deviceState.device.gatt.disconnect();
    }
}

function disconnectAllDevices() {
    disconnectDevice('arm');
    disconnectDevice('trunk');
}

function onDeviceDisconnected(deviceType) {
    const deviceState = devices[deviceType];
    const deviceLabel = deviceType.toUpperCase();

    // Stop angle polling
    stopAnglePolling(deviceType);

    // Remove event listener if exists
    if (deviceState.fileTransferCharacteristic && deviceState.fileTransferListener) {
        deviceState.fileTransferCharacteristic.removeEventListener('characteristicvaluechanged', deviceState.fileTransferListener);
    }

    deviceState.isConnected = false;
    deviceState.commandCharacteristic = null;
    deviceState.fileTransferCharacteristic = null;
    deviceState.fileTransferListener = null;
    deviceState.angleCharacteristic = null;
    deviceState.actualName = null;
    deviceState.firmwareVersion = null;
    deviceState.commandQueue = [];
    deviceState.isProcessingQueue = false;
    deviceState.isCalibrated = false;
    
    // Clear file list and buffer
    deviceState.files = [];
    deviceState.fileBuffer = '';
    deviceState.isReceivingFile = false;
    deviceState.currentFilename = null;

    updateDeviceStatus(deviceType, 'disconnected');
    updateDeviceInfo(deviceType);
    updateConnectionButtons();
    
    // Clear file list UI if this is the active file device
    if (state.fileDevice === deviceType) {
        elements.fileList.innerHTML = '<p class="placeholder">Device disconnected. Connect to view files.</p>';
    }

    // Reset live data
    if (deviceType === 'arm') {
        elements.armAngleValue.textContent = '--';
        elements.armZoneValue.textContent = '--';
        elements.armZoneValue.className = 'data-value zone-indicator';
    } else {
        elements.trunkAngleValue.textContent = '--';
        elements.trunkZoneValue.textContent = '--';
        elements.trunkZoneValue.className = 'data-value zone-indicator';
    }

    logToConsole(`${deviceLabel} disconnected`, 'info');
}

function updateDeviceStatus(deviceType, status) {
    const dotEl = deviceType === 'arm' ? elements.armStatusDot : elements.trunkStatusDot;
    const connectBtn = deviceType === 'arm' ? elements.connectArmBtn : elements.connectTrunkBtn;
    const disconnectBtn = deviceType === 'arm' ? elements.disconnectArmBtn : elements.disconnectTrunkBtn;

    dotEl.className = 'device-status-dot ' + status;

    if (status === 'connected') {
        connectBtn.disabled = true;
        disconnectBtn.disabled = false;
    } else if (status === 'connecting') {
        connectBtn.disabled = true;
        disconnectBtn.disabled = true;
    } else {
        connectBtn.disabled = false;
        disconnectBtn.disabled = true;
    }
}

function updateDeviceInfo(deviceType) {
    const deviceState = devices[deviceType];
    const nameEl = deviceType === 'arm' ? elements.armDeviceName : elements.trunkDeviceName;
    const firmwareEl = deviceType === 'arm' ? elements.armFirmware : elements.trunkFirmware;

    if (deviceState.isConnected && deviceState.device) {
        // Use actualName (read from GAP service) if available, fallback to cached name
        nameEl.textContent = deviceState.actualName || deviceState.device.name || 'Unknown';
        firmwareEl.textContent = deviceState.firmwareVersion ? `v${deviceState.firmwareVersion}` : '';
    } else {
        nameEl.textContent = 'Not connected';
        firmwareEl.textContent = '';
    }
}

function updateConnectionButtons() {
    const armConnected = devices.arm.isConnected;
    const trunkConnected = devices.trunk.isConnected;
    const anyConnected = armConnected || trunkConnected;

    // Enable calibrate button if ANY device is connected
    elements.calibrateConnectedBtn.disabled = !anyConnected;
    elements.disconnectAllBtn.disabled = !anyConnected;

    // Update button text based on what's connected
    if (armConnected && trunkConnected) {
        elements.calibrateConnectedBtn.textContent = 'Calibrate Both Devices';
    } else if (armConnected) {
        elements.calibrateConnectedBtn.textContent = 'Calibrate ARM';
    } else if (trunkConnected) {
        elements.calibrateConnectedBtn.textContent = 'Calibrate TRUNK';
    } else {
        elements.calibrateConnectedBtn.textContent = 'Calibrate Connected Devices';
    }

    // Update device-specific sections
    updateDeviceSectionStates();
}

function updateDeviceSectionStates() {
    const armConnected = devices.arm.isConnected;
    const trunkConnected = devices.trunk.isConnected;

    // ARM threshold section
    const armThresholdSection = document.getElementById('armThresholdSection');
    armThresholdSection.classList.toggle('device-disconnected', !armConnected);
    elements.armYellowSlider.disabled = !armConnected;
    elements.armRedSlider.disabled = !armConnected;
    elements.applyArmThresholdsBtn.disabled = !armConnected;

    // TRUNK threshold section
    const trunkThresholdSection = document.getElementById('trunkThresholdSection');
    trunkThresholdSection.classList.toggle('device-disconnected', !trunkConnected);
    elements.trunkYellowSlider.disabled = !trunkConnected;
    elements.trunkRedSlider.disabled = !trunkConnected;
    elements.applyTrunkThresholdsBtn.disabled = !trunkConnected;

    // ARM live data section
    const armLiveData = document.getElementById('armLiveData');
    armLiveData.classList.toggle('device-disconnected', !armConnected);

    // TRUNK live data section
    const trunkLiveData = document.getElementById('trunkLiveData');
    trunkLiveData.classList.toggle('device-disconnected', !trunkConnected);

    // File device selector - disable buttons for disconnected devices
    document.getElementById('fileDeviceArm').disabled = !armConnected;
    document.getElementById('fileDeviceTrunk').disabled = !trunkConnected;

    // If current file device is disconnected, switch to connected one
    if (state.fileDevice === 'arm' && !armConnected && trunkConnected) {
        state.fileDevice = 'trunk';
        document.getElementById('fileDeviceArm').classList.remove('active');
        document.getElementById('fileDeviceTrunk').classList.add('active');
    } else if (state.fileDevice === 'trunk' && !trunkConnected && armConnected) {
        state.fileDevice = 'arm';
        document.getElementById('fileDeviceTrunk').classList.remove('active');
        document.getElementById('fileDeviceArm').classList.add('active');
    }
}

// ============ Commands ============

// Queue a command to be sent (prevents GATT operation conflicts)
function sendCommand(deviceType, cmd) {
    const deviceState = devices[deviceType];
    const deviceLabel = deviceType.toUpperCase();

    if (!deviceState.isConnected || !deviceState.commandCharacteristic) {
        logToConsole(`${deviceLabel} not connected`, 'error');
        return Promise.resolve(false);
    }

    return new Promise((resolve) => {
        deviceState.commandQueue.push({ cmd, resolve });
        processCommandQueue(deviceType);
    });
}

// Process queued commands one at a time
async function processCommandQueue(deviceType) {
    const deviceState = devices[deviceType];
    const deviceLabel = deviceType.toUpperCase();

    if (deviceState.isProcessingQueue || deviceState.commandQueue.length === 0) {
        return;
    }

    deviceState.isProcessingQueue = true;

    while (deviceState.commandQueue.length > 0) {
        const { cmd, resolve } = deviceState.commandQueue.shift();

        if (!deviceState.isConnected || !deviceState.commandCharacteristic) {
            logToConsole(`${deviceLabel} disconnected, clearing queue`, 'error');
            resolve(false);
            continue;
        }

        try {
            const encoder = new TextEncoder();
            const encoded = encoder.encode(cmd);
            await deviceState.commandCharacteristic.writeValue(encoded);
            logToConsole(`[${deviceLabel}] Sent: ${cmd} (${encoded.length} bytes: ${Array.from(encoded).map(b => b.toString(16).padStart(2, '0')).join(' ')})`, 'sent');
            resolve(true);
        } catch (error) {
            logToConsole(`[${deviceLabel}] Failed: ${error.message}`, 'error');
            resolve(false);
        }

        // Small delay between commands to let BLE settle
        await new Promise(r => setTimeout(r, 100));
    }

    deviceState.isProcessingQueue = false;
}

function sendCommandToTarget(cmd) {
    if (state.targetDevice === 'both' || state.targetDevice === 'arm') {
        if (devices.arm.isConnected) sendCommand('arm', cmd);
    }
    if (state.targetDevice === 'both' || state.targetDevice === 'trunk') {
        if (devices.trunk.isConnected) sendCommand('trunk', cmd);
    }
}

function sendCustomCommand() {
    const cmd = elements.commandInput.value.trim();
    if (!cmd) return;

    const target = elements.consoleDeviceSelect.value;
    if (target === 'both' || target === 'arm') {
        if (devices.arm.isConnected) sendCommand('arm', cmd);
    }
    if (target === 'both' || target === 'trunk') {
        if (devices.trunk.isConnected) sendCommand('trunk', cmd);
    }

    elements.commandInput.value = '';
}

// ============ Calibration ============

function calibrateConnectedDevices() {
    const armConnected = devices.arm.isConnected;
    const trunkConnected = devices.trunk.isConnected;

    if (!armConnected && !trunkConnected) {
        logToConsole('No devices connected', 'error');
        return;
    }

    const deviceNames = [];
    const promises = [];

    if (armConnected) {
        promises.push(sendCommand('arm', 'C'));
        deviceNames.push('ARM');
    }
    if (trunkConnected) {
        promises.push(sendCommand('trunk', 'C'));
        deviceNames.push('TRUNK');
    }

    logToConsole(`Calibrating ${deviceNames.join(' and ')}...`, 'info');

    Promise.all(promises).then(() => {
        const msg = deviceNames.length === 2
            ? 'Both devices calibrated'
            : `${deviceNames[0]} calibrated`;
        showNotification(msg);

        // Start angle polling after calibration (firmware only sends angles when calibrated)
        setTimeout(() => {
            if (armConnected) {
                devices.arm.isCalibrated = true;
                startAnglePolling('arm');
            }
            if (trunkConnected) {
                devices.trunk.isCalibrated = true;
                startAnglePolling('trunk');
            }
        }, 1000); // Wait for calibration to complete
    });
}

// ============ Firmware Version ============

async function checkFirmwareVersion(deviceType) {
    const deviceState = devices[deviceType];
    deviceState.versionCheckPending = true;
    deviceState.firmwareVersion = null;

    sendCommand(deviceType, 'V');

    setTimeout(() => {
        if (deviceState.versionCheckPending) {
            deviceState.versionCheckPending = false;
            deviceState.firmwareVersion = null;
            logToConsole(`${deviceType.toUpperCase()} firmware: Unknown (legacy)`, 'info');
            updateDeviceInfo(deviceType);
            updateFeatureAvailability();
        }
        sendCommand(deviceType, '?');
    }, 1500);
}

function parseVersionResponse(message, deviceType) {
    if (message.includes('VERSION:')) {
        const match = message.match(/VERSION:(\d+\.?\d*)/);
        if (match) {
            devices[deviceType].firmwareVersion = parseFloat(match[1]);
            devices[deviceType].versionCheckPending = false;
            logToConsole(`${deviceType.toUpperCase()} firmware: v${devices[deviceType].firmwareVersion}`, 'info');
            updateDeviceInfo(deviceType);
            updateFeatureAvailability();
            return true;
        }
    }
    return false;
}

function updateFeatureAvailability() {
    // Check if any connected device supports advanced features
    const armSupports = devices.arm.firmwareVersion !== null && devices.arm.firmwareVersion >= MIN_VERSION_ADVANCED_FEATURES;
    const trunkSupports = devices.trunk.firmwareVersion !== null && devices.trunk.firmwareVersion >= MIN_VERSION_ADVANCED_FEATURES;
    const anySupports = armSupports || trunkSupports;

    document.querySelectorAll('.requires-v4').forEach(el => {
        el.classList.toggle('feature-unavailable', !anySupports);
    });
}

// Parse ACK/ERROR responses from firmware
function parseAckResponse(message, deviceType) {
    const deviceLabel = deviceType.toUpperCase();

    // ACK format: ACK:<cmd>:<result>
    if (message.startsWith('ACK:')) {
        const parts = message.substring(4).split(':');
        const cmd = parts[0] || '';
        const result = parts.slice(1).join(':') || 'OK';

        const cmdNames = {
            'C': 'Calibration',
            'A': 'Device type',
            'B': 'Device type',
            'S': 'Intensity',
            'M': 'Intensity',
            'W': 'Intensity',
            'F': 'Feedback',
            'N': 'Feedback/Name',
            'X': 'Filter',
            'Z': 'Filter',
            'T': 'DateTime',
            'K': 'Session',
            'J': 'Threshold', 'P': 'Threshold', 'L': 'Threshold',
            'G': 'Threshold', 'H': 'Threshold', 'I': 'Threshold', 'O': 'Threshold',
            'r': 'Vibration', 'y': 'Vibration',
            '?': 'Status'
        };

        const cmdName = cmdNames[cmd] || cmd;
        showNotification(`[${deviceLabel}] ${cmdName}: ${result}`);
        logToConsole(`[${deviceLabel}] ACK: ${cmdName} = ${result}`, 'received');
        return true;
    }

    // ERROR format: ERROR:<cmd>:<reason>
    if (message.startsWith('ERROR:')) {
        const parts = message.substring(6).split(':');
        const cmd = parts[0] || '';
        const reason = parts.slice(1).join(':') || 'Unknown error';

        logToConsole(`[${deviceLabel}] ERROR: ${cmd} - ${reason}`, 'error');
        showNotification(`[${deviceLabel}] Error: ${reason}`);
        return true;
    }

    return false;
}

// ============ Angle Data ============

// Start polling angle data for a device
function startAnglePolling(deviceType) {
    const deviceState = devices[deviceType];

    // Stop any existing polling
    stopAnglePolling(deviceType);

    if (!deviceState.angleCharacteristic) {
        logToConsole(`${deviceType.toUpperCase()} angle characteristic not available for polling`, 'error');
        return;
    }

    logToConsole(`Starting angle polling for ${deviceType.toUpperCase()}`, 'info');

    deviceState.anglePollingInterval = setInterval(async () => {
        if (!deviceState.isConnected || !deviceState.angleCharacteristic) {
            stopAnglePolling(deviceType);
            return;
        }

        try {
            const value = await deviceState.angleCharacteristic.readValue();
            const angle = value.getUint8(0);
            updateAngleDisplay(deviceType, angle);
        } catch (e) {
            // Silently ignore read errors (device might be busy)
        }
    }, 200); // Poll every 200ms
}

// Stop polling angle data
function stopAnglePolling(deviceType) {
    const deviceState = devices[deviceType];
    if (deviceState.anglePollingInterval) {
        clearInterval(deviceState.anglePollingInterval);
        deviceState.anglePollingInterval = null;
    }
}

// Update angle display
function updateAngleDisplay(deviceType, value) {
    // Use current threshold settings from state
    const yellowThreshold = deviceType === 'arm' ? state.armYellowThreshold : state.trunkYellowThreshold;
    const redThreshold = deviceType === 'arm' ? state.armRedThreshold : state.trunkRedThreshold;

    let zone = 'green';
    if (value >= redThreshold) zone = 'red';
    else if (value >= yellowThreshold) zone = 'yellow';

    if (deviceType === 'arm') {
        elements.armAngleValue.textContent = value;
        elements.armZoneValue.textContent = zone.toUpperCase();
        elements.armZoneValue.className = 'data-value zone-indicator ' + zone;
    } else {
        elements.trunkAngleValue.textContent = value;
        elements.trunkZoneValue.textContent = zone.toUpperCase();
        elements.trunkZoneValue.className = 'data-value zone-indicator ' + zone;
    }
}

// Legacy handler for devices that support notifications
function onAngleReceived(event, deviceType) {
    const value = event.target.value.getUint8(0);
    updateAngleDisplay(deviceType, value);
}

// ============ Threshold Controls ============

function updateThresholdSlider(deviceType, color) {
    const yellowSlider = deviceType === 'arm' ? elements.armYellowSlider : elements.trunkYellowSlider;
    const redSlider = deviceType === 'arm' ? elements.armRedSlider : elements.trunkRedSlider;
    const yellowValue = deviceType === 'arm' ? elements.armYellowValue : elements.trunkYellowValue;
    const redValue = deviceType === 'arm' ? elements.armRedValue : elements.trunkRedValue;

    if (color === 'yellow') {
        const value = parseInt(yellowSlider.value);
        yellowValue.textContent = `${value}°`;

        if (deviceType === 'arm') {
            state.armYellowThreshold = value;
        } else {
            state.trunkYellowThreshold = value;
        }

        // Ensure red is always higher than yellow
        if (parseInt(redSlider.value) <= value) {
            redSlider.value = value + 5;
            updateThresholdSlider(deviceType, 'red');
        }
    } else {
        const value = parseInt(redSlider.value);
        redValue.textContent = `${value}°`;

        if (deviceType === 'arm') {
            state.armRedThreshold = value;
        } else {
            state.trunkRedThreshold = value;
        }

        // Ensure yellow is always lower than red
        if (parseInt(yellowSlider.value) >= value) {
            yellowSlider.value = value - 5;
            updateThresholdSlider(deviceType, 'yellow');
        }
    }
}

function applyThresholds(deviceType) {
    const defaults = deviceType === 'arm' ? THRESHOLDS.ARM : THRESHOLDS.TRUNK;
    const yellow = deviceType === 'arm' ? state.armYellowThreshold : state.trunkYellowThreshold;
    const red = deviceType === 'arm' ? state.armRedThreshold : state.trunkRedThreshold;

    // Calculate margin from default
    const margin = yellow - defaults.yellow;

    // Determine command based on margin
    let cmd = 'O';
    if (margin <= -15) cmd = 'I';
    else if (margin <= -10) cmd = 'H';
    else if (margin <= -5) cmd = 'G';
    else if (margin <= 2) cmd = 'O';
    else if (margin <= 7) cmd = 'J';
    else if (margin <= 12) cmd = 'P';
    else cmd = 'L';

    // Send to specific device
    if (devices[deviceType].isConnected) {
        sendCommand(deviceType, cmd);
        showNotification(`${deviceType.toUpperCase()} thresholds: Yellow ${yellow}°, Red ${red}°`);
    } else {
        logToConsole(`${deviceType.toUpperCase()} not connected`, 'error');
    }
}

// ============ DateTime ============

function setDatetimeFromInput() {
    const datetime = elements.datetimeInput.value;
    if (!datetime) {
        logToConsole('Please select a date/time', 'error');
        return;
    }
    sendDatetime(new Date(datetime));
}

function setCurrentDatetime() {
    sendDatetime(new Date());
}

function sendDatetime(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    const second = String(date.getSeconds()).padStart(2, '0');

    const cmd = `T:${year}${month}${day}${hour}${minute}${second}`;
    sendCommandToTarget(cmd);
}

// ============ Session Name ============

function setSessionName() {
    let name = elements.sessionNameInput.value.trim();
    if (!name) {
        logToConsole('Please enter a session name', 'error');
        return;
    }
    name = name.substring(0, 16).replace(/[^a-zA-Z0-9_-]/g, '_');
    sendCommandToTarget(`N:${name}`);
}

// ============ File Operations ============

function listFiles() {
    const deviceState = devices[state.fileDevice];
    if (!deviceState) {
        logToConsole('Invalid file device selected', 'error');
        return;
    }
    
    if (!deviceState.isConnected) {
        logToConsole(`${state.fileDevice.toUpperCase()} not connected`, 'error');
        return;
    }

    // Reset file reception state
    deviceState.files = [];
    deviceState.isReceivingFile = false;
    deviceState.fileBuffer = '';
    deviceState.isReceivingBinary = false;
    deviceState.binaryBuffer = new Uint8Array(0);
    deviceState.binaryHexBuffer = '';

    elements.fileList.innerHTML = '<p class="placeholder">Loading files...</p>';
    sendCommand(state.fileDevice, 'D');

    // Fallback to parse console output if files don't arrive via BLE
    setTimeout(() => {
        if (deviceState.files.length === 0) {
            parseFileListFromConsole(state.fileDevice);
        }
        renderFileList(state.fileDevice);
    }, 2000);
}

function parseFileListFromConsole(deviceType) {
    const deviceState = devices[deviceType];
    if (!deviceState) {
        console.warn('parseFileListFromConsole: invalid device type:', deviceType);
        return;
    }
    
    const consoleText = elements.consoleOutput.textContent;
    if (!consoleText) {
        console.warn('parseFileListFromConsole: console is empty');
        return;
    }
    
    const lines = consoleText.split('\n');

    deviceState.files = [];
    let inFileList = false;

    for (const line of lines) {
        if (line.includes('FILES:BEGIN')) {
            inFileList = true;
            deviceState.files = [];
        } else if (line.includes('FILES:END')) {
            inFileList = false;
        } else if (inFileList && line.includes('FILE:')) {
            const match = line.match(/FILE:([^,]+),(\d+)/);
            if (match) {
                const filename = match[1].trim();
                const filesize = parseInt(match[2]);
                
                // Prevent duplicates
                const exists = deviceState.files.some(f => f.name === filename);
                if (!exists) {
                    deviceState.files.push({ name: filename, size: filesize });
                }
            }
        }
    }
    
    console.log(`Parsed ${deviceState.files.length} files from console for ${deviceType}`);
}

function renderFileList(deviceType) {
    const deviceState = devices[deviceType];
    
    // Safety check for undefined device state
    if (!deviceState) {
        console.error('renderFileList: invalid device type:', deviceType);
        elements.fileList.innerHTML = '<p class="placeholder error">Error: Invalid device</p>';
        return;
    }
    
    // Safety check for undefined files array
    if (!deviceState.files) {
        console.warn('renderFileList: files array is undefined, initializing...');
        deviceState.files = [];
    }

    if (deviceState.files.length === 0) {
        elements.fileList.innerHTML = '<p class="placeholder">No files found</p>';
        return;
    }

    // Filter out _m.txt metadata files and .bin files from display (case insensitive)
    const visibleFiles = deviceState.files.filter(file => {
        if (!file || !file.name) return false;  // Safety check
        const name = file.name.toLowerCase();
        return !name.endsWith('_m.txt') && !name.endsWith('.bin');
    });
    
    if (visibleFiles.length === 0) {
        elements.fileList.innerHTML = '<p class="placeholder">No session files found</p>';
        return;
    }

    try {
        const html = visibleFiles.map(file => {
            const isCSV = file.name.toLowerCase().endsWith('.csv');
            const baseName = file.name.replace(/\.csv$/i, '');
            const binFilename = baseName + '.bin';
            const metaName = baseName + '_m.txt';
            
            // Check if we have CSV+meta OR bin+meta
            const fileCache = deviceState.fileCache || {};
            const csvCached = fileCache[file.name] !== undefined;
            const binCached = fileCache[binFilename] !== undefined;
            const metaCached = fileCache[metaName] !== undefined;
            const reportReady = isCSV && (csvCached || binCached) && metaCached;
            
            return `
            <div class="file-item" data-filename="${file.name}">
                <div class="file-info">
                    <span class="file-name">${file.name}</span>
                    <span class="file-size">${formatFileSize(file.size)}</span>
                </div>
                <div class="file-actions-inline">
                    ${isCSV ? `
                        <button class="btn btn-small btn-info" onclick="viewMetadata('${file.name}', '${deviceType}')">Meta</button>
                        <button class="btn btn-small btn-primary" onclick="downloadFile('${binFilename}', '${deviceType}')">Bin</button>
                        <button class="btn btn-small btn-success" 
                                onclick="generateReport('${file.name}', '${deviceType}')" 
                                ${reportReady ? '' : 'disabled'}
                                title="${reportReady ? 'Generate Report' : 'Download Bin/CSV and Meta files first'}">
                            Report
                        </button>
                    ` : ''}
                    <button class="btn btn-small btn-primary" onclick="downloadFile('${file.name}', '${deviceType}')">Download</button>
                </div>
            </div>
        `;
    }).join('');

    elements.fileList.innerHTML = html;
    } catch (error) {
        console.error('Error rendering file list:', error);
        elements.fileList.innerHTML = '<p class="placeholder error">Error rendering files. Please refresh.</p>';
    }
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

async function downloadFile(filename, deviceType) {
    const deviceState = devices[deviceType];
    if (!deviceState.isConnected) {
        logToConsole(`${deviceType.toUpperCase()} not connected`, 'error');
        return;
    }

    deviceState.currentFilename = filename;
    
    // Check if it's a binary file
    if (filename.endsWith('.bin')) {
        deviceState.binaryBuffer = new Uint8Array(0);
        deviceState.binaryHexBuffer = '';
        deviceState.isReceivingBinary = true;
        deviceState.binaryFileSize = 0;
        
        elements.downloadProgress.classList.remove('hidden');
        elements.progressFill.style.width = '0%';
        elements.progressText.textContent = `Downloading ${filename}...`;
        
        sendCommand(deviceType, `Q:${filename}`);
    } else {
        // Original CSV/text file download logic
        deviceState.fileBuffer = '';
        deviceState.isReceivingFile = true;

        elements.downloadProgress.classList.remove('hidden');
        elements.progressFill.style.width = '0%';
        elements.progressText.textContent = `Downloading ${filename}...`;

        sendCommand(deviceType, `R:${filename}`);
    }
    
    // No timeout - rely on STREAM:END/BIN:END marker from firmware
}

async function viewMetadata(filename, deviceType) {
    const deviceState = devices[deviceType];
    if (!deviceState.isConnected) {
        logToConsole(`${deviceType.toUpperCase()} not connected`, 'error');
        return;
    }

    const baseName = filename.replace(/\.csv$/i, '');
    deviceState.currentFilename = baseName + '_m.txt';
    deviceState.fileBuffer = '';
    deviceState.isReceivingFile = true;

    console.log('ViewMetadata - filename:', filename, 'baseName:', baseName);
    logToConsole(`Downloading metadata: ${baseName}_m.txt`, 'info');
    sendCommand(deviceType, `M:${baseName}`);
    
    // No timeout - rely on META:END marker from firmware
}

function onFileDataReceived(event, deviceType) {
    const deviceState = devices[deviceType];
    const decoder = new TextDecoder();
    const value = decoder.decode(event.target.value);

    // Always log file protocol data (even in non-debug mode) for diagnostics
    const isFileProtocol = value.includes('FILE') || value.includes('STREAM') || value.includes('META') || value.includes('ERROR');
    if (isFileProtocol) {
        logToConsole(`[${deviceType.toUpperCase()} BLE]: ${value.substring(0, 120)}`, 'error');
    } else {
        logToConsole(`[${deviceType.toUpperCase()} Data]: ${value.substring(0, 80)}`, 'received');
    }

    // Parse file listing protocol (D command response)
    if (value.includes('FILES:BEGIN')) {
        deviceState.files = [];
        logToConsole(`[${deviceType.toUpperCase()}] File listing started`, 'info');
        return;
    } else if (value.includes('FILES:END')) {
        logToConsole(`[${deviceType.toUpperCase()}] File listing done: ${deviceState.files.length} files`, 'info');
        renderFileList(deviceType);
        return;
    } else if (value.includes('FILE:') && !value.includes('FILES:')) {
        const match = value.match(/FILE:([^,]+),(\d+)/);
        if (match) {
            const filename = match[1].trim();
            const filesize = parseInt(match[2]);
            
            // Check for duplicates before adding
            const exists = deviceState.files.some(f => f.name === filename);
            if (!exists) {
                deviceState.files.push({ name: filename, size: filesize });
                logToConsole(`[${deviceType.toUpperCase()}] Found file: ${filename} (${filesize} bytes)`, 'info');
            }
        }
        return;
    }

    // Parse binary file protocol (Q: command response)
    if (value.includes('BIN:BEGIN')) {
        const match = value.match(/BIN:BEGIN,(\d+)/);
        if (match) {
            deviceState.binaryFileSize = parseInt(match[1]);
            deviceState.binaryBuffer = new Uint8Array(0);  // Use Uint8Array instead of string
            deviceState.isReceivingBinary = true;
            logToConsole(`[${deviceType.toUpperCase()}] Binary reception started: ${deviceState.binaryFileSize} bytes`, 'info');
        }
        return;
    }

    if (value === 'BIN:END' || value.startsWith('BIN:END') || value === '<<BINEOF>>' || value.includes('<<BINEOF>>')) {
        if (deviceState.isReceivingBinary) {
            logToConsole(`[${deviceType.toUpperCase()}] Binary reception complete`, 'success');
            finishBinaryDownload(deviceType);
        }
        return;
    }

    // Accumulate binary data (raw bytes or check if it's the old hex format)
    if (deviceState.isReceivingBinary) {
        // Check if this is raw binary data or hex string
        const rawData = event.target.value;  // This is the original DataView
        
        if (rawData instanceof DataView || rawData instanceof ArrayBuffer) {
            // Raw binary data - convert to Uint8Array and append
            const bytes = new Uint8Array(rawData.buffer || rawData);
            
            // Check for end marker in binary data
            const endMarker = new TextEncoder().encode('<<BINEOF>>');
            let hasEndMarker = false;
            if (bytes.length >= endMarker.length) {
                // Check last bytes for end marker
                const lastBytes = bytes.slice(-endMarker.length);
                hasEndMarker = endMarker.every((val, idx) => val === lastBytes[idx]);
            }
            
            if (hasEndMarker) {
                // Remove end marker and append data
                const dataWithoutMarker = bytes.slice(0, -endMarker.length);
                const newBuffer = new Uint8Array(deviceState.binaryBuffer.length + dataWithoutMarker.length);
                newBuffer.set(deviceState.binaryBuffer);
                newBuffer.set(dataWithoutMarker, deviceState.binaryBuffer.length);
                deviceState.binaryBuffer = newBuffer;
                
                // Finish download
                logToConsole(`[${deviceType.toUpperCase()}] Binary reception complete (in-band EOF)`, 'success');
                finishBinaryDownload(deviceType);
                return;
            } else {
                // Append binary data
                const newBuffer = new Uint8Array(deviceState.binaryBuffer.length + bytes.length);
                newBuffer.set(deviceState.binaryBuffer);
                newBuffer.set(bytes, deviceState.binaryBuffer.length);
                deviceState.binaryBuffer = newBuffer;
            }
        } else if (typeof value === 'string') {
            // Fallback: hex string format (old method)
            if (!deviceState.binaryHexBuffer) {
                deviceState.binaryHexBuffer = '';
            }
            deviceState.binaryHexBuffer += value;
        }
        
        const progress = Math.min(100, (deviceState.binaryBuffer.length / deviceState.binaryFileSize) * 100);
        elements.progressFill.style.width = progress + '%';
        return;
    }

    // Parse file streaming protocol (R: command response)
    if (value.includes('STREAM:BEGIN') || value.includes('META:BEGIN')) {
        deviceState.fileBuffer = '';
        deviceState.isReceivingFile = true;
        logToConsole(`[${deviceType.toUpperCase()}] File reception started`, 'info');
        return;  // Don't process this packet further
    }
    
    // More strict END marker detection - must be exact match or at start of line
    const hasEndMarker = value === '<<EOF>>' || value === 'STREAM:END' || value === 'META:END' ||
                         value.startsWith('<<EOF>>') || value.startsWith('STREAM:END') || value.startsWith('META:END');
    
    if (hasEndMarker) {
        // Extract any data BEFORE the END marker in the same packet
        let dataBeforeEnd = '';
        const endMarkers = ['<<EOF>>', 'STREAM:END', 'META:END'];
        for (const marker of endMarkers) {
            const idx = value.indexOf(marker);
            if (idx > 0) {
                dataBeforeEnd = value.substring(0, idx);
                break;
            }
        }
        
        // Add final data if any
        if (dataBeforeEnd.length > 0 && deviceState.isReceivingFile) {
            deviceState.fileBuffer += dataBeforeEnd;
        }
        
        // Finish immediately - firmware guarantees END comes last
        if (deviceState.isReceivingFile) {
            logToConsole(`[${deviceType.toUpperCase()}] File reception complete: ${deviceState.fileBuffer.length} bytes`, 'success');
            finishFileDownload(deviceType);
        }
        return;  // Don't process this packet further
    }
    
    // Accumulate file data
    if (deviceState.isReceivingFile) {
        deviceState.fileBuffer += value;

        const file = deviceState.files.find(f => f.name === deviceState.currentFilename);
        if (file && file.size > 0) {
            const progress = Math.min(100, (deviceState.fileBuffer.length / file.size) * 100);
            elements.progressFill.style.width = progress + '%';
            
            // Log progress occasionally
            if (deviceState.fileBuffer.length % 1000 < value.length) {
                logToConsole(`[${deviceType.toUpperCase()}] Progress: ${deviceState.fileBuffer.length}/${file.size} bytes (${progress.toFixed(1)}%)`, 'info');
            }
        }
        return;  // Don't process as command
    }

    // Check for version response
    parseVersionResponse(value, deviceType);

    // Check for ACK/ERROR responses
    parseAckResponse(value, deviceType);
}

function finishFileDownload(deviceType) {
    const deviceState = devices[deviceType];
    deviceState.isReceivingFile = false;
    elements.downloadProgress.classList.add('hidden');

    console.log('finishFileDownload:', {
        deviceType,
        bufferLength: deviceState.fileBuffer.length,
        reportMode: deviceState.reportMode,
        filename: deviceState.currentFilename
    });

    if (deviceState.fileBuffer.length > 0) {
        const filename = deviceState.currentFilename;
        const content = deviceState.fileBuffer;
        
        // Save to cache
        deviceState.fileCache[filename] = content;
        console.log('Cached file:', filename, 'Size:', content.length);
        
        // Check if this is for report generation
        if (deviceState.reportMode === 'metadata') {
            reportData.metadata = content;
            console.log('Metadata saved, length:', reportData.metadata.length);
            logToConsole(`Metadata loaded for report (${reportData.metadata.length} bytes)`, 'info');
            deviceState.reportMode = null;
        } else if (deviceState.reportMode === 'csv') {
            reportData.csvData = content;
            console.log('CSV data saved, length:', reportData.csvData.length);
            logToConsole(`CSV data loaded for report (${reportData.csvData.length} bytes)`, 'info');
            deviceState.reportMode = null;
        } else {
            // Normal file download - show preview
            showFilePreview(filename, content);
        }
        
        // Refresh file list to update button states
        renderFileList(deviceType);
    }
}

function finishBinaryDownload(deviceType) {
    const deviceState = devices[deviceType];
    deviceState.isReceivingBinary = false;
    elements.downloadProgress.classList.add('hidden');

    const filename = deviceState.currentFilename;
    
    try {
        let records;
        
        // Check if we have raw binary data or hex string
        if (deviceState.binaryBuffer instanceof Uint8Array) {
            // Parse raw binary data directly
            records = BinaryParser.parseFromBytes(deviceState.binaryBuffer);
        } else if (deviceState.binaryHexBuffer) {
            // Fallback: parse hex string (old method)
            records = BinaryParser.parseFromHexString(deviceState.binaryHexBuffer);
        } else {
            throw new Error('No binary data received');
        }
        
        // Store in cache as CSV for compatibility
        const csvData = BinaryParser.toCSV(records);
        deviceState.fileCache[filename] = csvData;
        
        logToConsole(`Parsed ${records.length} records from binary file`, 'success');
        showNotification(`Downloaded ${filename}: ${records.length} records`);
        
        // Clear buffers
        deviceState.binaryBuffer = new Uint8Array(0);
        deviceState.binaryHexBuffer = '';
        
        // Update file list to show download status
        renderFileList(deviceType);
        
    } catch (error) {
        logToConsole(`Error parsing binary file: ${error.message}`, 'error');
        showNotification(`Error parsing ${filename}`, 'error');
    }
}

function showFilePreview(filename, content) {
    elements.modalTitle.textContent = filename;
    elements.fileContent.textContent = content;
    elements.fileModal.classList.remove('hidden');
}

function closeModal() {
    elements.fileModal.classList.add('hidden');
}

function downloadCurrentFile() {
    const content = elements.fileContent.textContent;
    const filename = elements.modalTitle.textContent;

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    logToConsole(`Downloaded: ${filename}`, 'info');
    closeModal();
}

// ============ Debug Mode ============

function toggleDebugMode() {
    setDebugMode(elements.debugModeToggle.checked);
}

function setDebugMode(enabled) {
    state.debugMode = enabled;
    elements.debugModeToggle.checked = enabled;
    document.body.classList.toggle('debug-mode', enabled);

    if (elements.consolePanel) {
        elements.consolePanel.classList.toggle('hidden', !enabled);
    }
}

// ============ Console ============

function logToConsole(message, type = 'received') {
    // Always log to browser console for debugging
    const consoleMethod = type === 'error' ? 'error' : type === 'info' ? 'info' : 'log';
    console[consoleMethod](`[${type}] ${message}`);
    
    if (!state.debugMode && (type === 'sent' || type === 'received')) {
        // Still parse file data even in production mode
        if (message.includes('FILE:')) {
            const match = message.match(/FILE:([^,]+),(\d+)/);
            if (match) {
                // Determine which device this is for
                const deviceType = state.fileDevice;
                if (devices[deviceType]) {
                    devices[deviceType].files.push({ name: match[1], size: parseInt(match[2]) });
                }
            }
        }
        return;
    }
    
    // Check if console output element exists
    if (!elements.consoleOutput) {
        console.warn('Console output element not available yet');
        return;
    }

    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;

    const timestamp = new Date().toLocaleTimeString();
    entry.textContent = `[${timestamp}] ${message}`;

    elements.consoleOutput.appendChild(entry);
    elements.consoleOutput.scrollTop = elements.consoleOutput.scrollHeight;

    // Parse file list
    if (message.includes('FILE:')) {
        const match = message.match(/FILE:([^,]+),(\d+)/);
        if (match) {
            const deviceType = state.fileDevice;
            if (devices[deviceType]) {
                devices[deviceType].files.push({ name: match[1], size: parseInt(match[2]) });
            }
        }
    }
}

function clearConsole() {
    elements.consoleOutput.innerHTML = '';
    logToConsole('Console cleared', 'info');
}

// ============ UI State ============

function setFeedbackState(enabled) {
    state.feedbackEnabled = enabled;
    document.querySelectorAll('#feedbackButtons button').forEach(btn => {
        btn.classList.toggle('active', (btn.dataset.feedback === 'on') === enabled);
    });
    document.getElementById('currentFeedback').textContent = enabled ? '(ON)' : '(OFF)';
}

function setFilterState(enabled) {
    state.filterEnabled = enabled;
    document.querySelectorAll('#filterButtons button').forEach(btn => {
        btn.classList.toggle('active', (btn.dataset.filter === 'on') === enabled);
    });
    document.getElementById('currentFilter').textContent = enabled ? '(ON)' : '(OFF)';
}

function setIntensityState(intensity) {
    state.intensity = intensity;
    document.querySelectorAll('#intensityButtons button').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.intensity === intensity);
    });
    const displayText = intensity.charAt(0).toUpperCase() + intensity.slice(1);
    document.getElementById('currentIntensity').textContent = `(${displayText})`;
}

function showNotification(message) {
    logToConsole(message, 'info');
}

// ============ Global Functions ============

window.downloadFile = downloadFile;
window.viewMetadata = viewMetadata;
window.generateReport = generateReport;

// ============ Report Generation ============

let reportData = {
    csvData: null,
    metadata: null,
    filename: null,
    deviceType: null,
    fullData: null,  // Store full parsed data
    currentData: null,  // Store filtered data based on range
    timeRange: { start: 0, end: 100 }  // Percentage range
};

async function generateReport(filename, deviceType) {
    console.log('generateReport called:', filename, deviceType);
    
    const deviceState = devices[deviceType];
    if (!deviceState.isConnected) {
        alert(`${deviceType.toUpperCase()} device not connected. Please connect first.`);
        logToConsole(`${deviceType.toUpperCase()} not connected`, 'error');
        return;
    }

    // Check if Chart.js is loaded
    if (typeof Chart === 'undefined') {
        alert('Chart.js library not loaded. Please refresh the page.');
        logToConsole('Chart.js not loaded', 'error');
        return;
    }

    const baseName = filename.replace(/\.csv$/i, '');
    const binFilename = baseName + '.bin';
    const metaName = baseName + '_m.txt';
    
    console.log('GenerateReport - filename:', filename, 'baseName:', baseName, 'binFilename:', binFilename, 'metaName:', metaName);
    
    // Check if we have binary file instead
    const hasBinFile = deviceState.fileCache[binFilename];
    const hasMetaFile = deviceState.fileCache[metaName];
    
    // Prefer binary + meta if available
    if (hasBinFile && hasMetaFile) {
        try {
            const binData = deviceState.fileCache[binFilename]; // Already converted to CSV
            const metaText = deviceState.fileCache[metaName];
            
            console.log('Using binary file for report generation');
            logToConsole('Using binary data to generate report...', 'info');
            
            reportData.filename = filename;
            reportData.deviceType = deviceType;
            reportData.csvData = binData;
            reportData.metadata = metaText;
            
            // Generate report immediately
            setTimeout(() => {
                displayReport();
            }, 100);
            return;
            
        } catch (error) {
            console.error('Error generating report from binary:', error);
            showNotification('Error generating report from binary file', 'error');
            return;
        }
    }
    
    // Check if files are cached
    const csvCached = deviceState.fileCache[filename];
    const metaCached = deviceState.fileCache[metaName];
    
    console.log('Cache status:', {
        csv: csvCached ? 'cached' : 'not cached',
        meta: metaCached ? 'cached' : 'not cached'
    });

    reportData.filename = filename;
    reportData.deviceType = deviceType;
    
    if (csvCached && metaCached) {
        // Use cached data directly
        console.log('Using cached data for report');
        logToConsole('Using cached data to generate report...', 'info');
        
        reportData.csvData = csvCached;
        reportData.metadata = metaCached;
        
        // Generate report immediately
        setTimeout(() => {
            displayReport();
        }, 100);
    } else {
        // Need to download
        alert(`Downloading data for ${filename}. This may take a few seconds...`);
        logToConsole(`Downloading data for ${filename}...`, 'info');
        
        reportData.csvData = null;
        reportData.metadata = null;
        
        // Download metadata if not cached
        if (!metaCached) {
            console.log('Downloading metadata:', metaName);
            await downloadMetadataForReport(baseName, deviceType);
        } else {
            reportData.metadata = metaCached;
        }
        
        // Wait a bit for metadata to complete
        setTimeout(async () => {
            console.log('Metadata phase complete');
            
            // Download CSV if not cached
            if (!csvCached) {
                console.log('Downloading CSV:', filename);
                await downloadCSVForReport(filename, deviceType);
            } else {
                reportData.csvData = csvCached;
            }
            
            // Wait for CSV download and process report
            setTimeout(() => {
                console.log('Checking report data:', {
                    csvData: reportData.csvData ? reportData.csvData.length : 0,
                    metadata: reportData.metadata ? reportData.metadata.length : 0
                });
                
                if (reportData.csvData && reportData.metadata) {
                    displayReport();
                } else {
                    const msg = `Failed to download report data. CSV: ${reportData.csvData ? 'OK' : 'Missing'}, Metadata: ${reportData.metadata ? 'OK' : 'Missing'}`;
                    alert(msg);
                    logToConsole(msg, 'error');
                }
            }, 3000);
        }, 2000);
    }
}

async function downloadMetadataForReport(baseName, deviceType) {
    const deviceState = devices[deviceType];
    
    const metaFilename = baseName + '_m.txt';
    deviceState.currentFilename = metaFilename;
    deviceState.fileBuffer = '';
    deviceState.isReceivingFile = true;
    deviceState.reportMode = 'metadata';

    console.log('DownloadMetadataForReport - baseName:', baseName, 'requesting metadata file:', metaFilename);
    logToConsole(`Downloading metadata: ${metaFilename}`, 'info');
    sendCommand(deviceType, `M:${baseName}`);
}

async function downloadCSVForReport(filename, deviceType) {
    const deviceState = devices[deviceType];
    
    deviceState.currentFilename = filename;
    deviceState.fileBuffer = '';
    deviceState.isReceivingFile = true;
    deviceState.reportMode = 'csv';

    console.log('Requesting CSV file:', filename);
    logToConsole(`Downloading CSV: ${filename}`, 'info');
    sendCommand(deviceType, `R:${filename}`);
}

function parseCSVData(csvText) {
    console.log('parseCSVData called, text length:', csvText ? csvText.length : 0);
    if (!csvText || csvText.length === 0) {
        console.error('CSV text is empty or null');
        return [];
    }
    
    const lines = csvText.trim().split('\n');
    console.log('CSV lines:', lines.length);
    const data = [];
    
    let timeOffset = 0;  // Cumulative time offset for multiple sequences
    let previousElapsed = 0;
    let sequenceCount = 0;
    
    // Skip header
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const parts = line.split(',');
        if (parts.length >= 5) {
            try {
                const elapsed_ms = parseInt(parts[0]);
                
                // Detect sequence reset (elapsed_ms decreases or resets to near 0)
                if (i > 1 && elapsed_ms < previousElapsed) {
                    // New sequence detected, add offset
                    timeOffset += previousElapsed;
                    sequenceCount++;
                    console.log(`Sequence #${sequenceCount} detected at line ${i}, offset: ${timeOffset}ms`);
                }
                
                data.push({
                    elapsed_ms: elapsed_ms,  // Original value
                    adjusted_elapsed_ms: elapsed_ms + timeOffset,  // Continuous timeline
                    timestamp: parts[1],
                    angle: parseFloat(parts[2]),
                    feedback: parseInt(parts[3]),
                    zone: parts[4].trim(),
                    sequence: sequenceCount
                });
                
                previousElapsed = elapsed_ms;
            } catch (e) {
                console.warn('Error parsing line', i, ':', line, e);
            }
        }
    }
    
    console.log(`Parsed data points: ${data.length}, sequences detected: ${sequenceCount + 1}`);
    return data;
}

function parseMetadata(metaText) {
    console.log('parseMetadata called, text length:', metaText ? metaText.length : 0);
    const metadata = {};
    if (!metaText) {
        console.warn('Metadata text is empty');
        return metadata;
    }
    
    const lines = metaText.trim().split('\n');
    console.log('Metadata lines:', lines.length);
    
    for (const line of lines) {
        if (line.includes('=')) {
            const [key, value] = line.split('=');
            metadata[key.trim()] = value.trim();
        }
    }
    
    console.log('Parsed metadata:', metadata);
    return metadata;
}

function displayReport() {
    console.log('displayReport called');
    console.log('CSV data length:', reportData.csvData ? reportData.csvData.length : 0);
    console.log('Metadata length:', reportData.metadata ? reportData.metadata.length : 0);
    
    try {
        const data = parseCSVData(reportData.csvData);
        console.log('Parsed CSV data points:', data.length);
        
        const metadata = parseMetadata(reportData.metadata);
        console.log('Parsed metadata:', metadata);
        
        if (data.length === 0) {
            alert('No data found in CSV file. The file may be empty or corrupted.');
            logToConsole('No data found in CSV file', 'error');
            return;
        }
        
        // Store full data
        reportData.fullData = data;
        reportData.currentData = data;
        reportData.metadata = metadata;
        
        // Show modal
        const modal = document.getElementById('reportModal');
        if (!modal) {
            alert('Report modal not found. Please refresh the page.');
            return;
        }
        modal.classList.remove('hidden');
        
        // Set title
        document.getElementById('reportTitle').textContent = `Report: ${reportData.filename}`;
        
        // Display metadata
        displayMetadataInfo(metadata, data);
        
        // Initialize time range controls
        initializeTimeRangeControls(data);
        
        // Render report with full data initially
        renderReportAnalysis();
        
        logToConsole('Report generated successfully', 'info');
        alert('Report generated successfully!');
    } catch (error) {
        console.error('Error generating report:', error);
        alert('Error generating report: ' + error.message);
        logToConsole('Error generating report: ' + error.message, 'error');
    }
}

function initializeTimeRangeControls(data) {
    const totalTime = (data[data.length - 1].adjusted_elapsed_ms - data[0].adjusted_elapsed_ms) / 1000;
    const startSlider = document.getElementById('rangeStart');
    const endSlider = document.getElementById('rangeEnd');
    const startLabel = document.getElementById('rangeStartLabel');
    const endLabel = document.getElementById('rangeEndLabel');
    const durationLabel = document.getElementById('rangeDuration');
    const resetBtn = document.getElementById('resetRangeBtn');
    const applyBtn = document.getElementById('applyRangeBtn');
    
    // Reset sliders
    startSlider.value = 0;
    endSlider.value = 100;
    reportData.timeRange = { start: 0, end: 100 };
    
    // Update labels
    function updateLabels() {
        const startPct = parseFloat(startSlider.value);
        const endPct = parseFloat(endSlider.value);
        const startTime = (totalTime * startPct / 100).toFixed(1);
        const endTime = (totalTime * endPct / 100).toFixed(1);
        const duration = (endTime - startTime).toFixed(1);
        
        startLabel.textContent = `${startTime}s`;
        endLabel.textContent = `${endTime}s`;
        
        if (startPct === 0 && endPct === 100) {
            durationLabel.textContent = 'Full session';
        } else {
            durationLabel.textContent = `${duration}s selected`;
        }
    }
    
    // Event listeners for sliders
    startSlider.addEventListener('input', () => {
        if (parseFloat(startSlider.value) >= parseFloat(endSlider.value)) {
            startSlider.value = parseFloat(endSlider.value) - 0.1;
        }
        updateLabels();
    });
    
    endSlider.addEventListener('input', () => {
        if (parseFloat(endSlider.value) <= parseFloat(startSlider.value)) {
            endSlider.value = parseFloat(startSlider.value) + 0.1;
        }
        updateLabels();
    });
    
    // Reset button
    resetBtn.addEventListener('click', () => {
        startSlider.value = 0;
        endSlider.value = 100;
        reportData.timeRange = { start: 0, end: 100 };
        updateLabels();
        applyTimeRange();
    });
    
    // Apply button
    applyBtn.addEventListener('click', () => {
        reportData.timeRange = {
            start: parseFloat(startSlider.value),
            end: parseFloat(endSlider.value)
        };
        applyTimeRange();
    });
    
    updateLabels();
}

function applyTimeRange() {
    const { start, end } = reportData.timeRange;
    const fullData = reportData.fullData;
    
    if (!fullData || fullData.length === 0) return;
    
    const totalTime = fullData[fullData.length - 1].adjusted_elapsed_ms - fullData[0].adjusted_elapsed_ms;
    const startTime = fullData[0].adjusted_elapsed_ms + (totalTime * start / 100);
    const endTime = fullData[0].adjusted_elapsed_ms + (totalTime * end / 100);
    
    // Filter data based on time range
    reportData.currentData = fullData.filter(point => 
        point.adjusted_elapsed_ms >= startTime && point.adjusted_elapsed_ms <= endTime
    );
    
    console.log(`Filtered data: ${reportData.currentData.length} points (${start}% - ${end}%)`);
    
    // Re-render analysis with filtered data
    renderReportAnalysis();
}

function renderReportAnalysis() {
    const data = reportData.currentData;
    const metadata = reportData.metadata;
    
    if (!data || data.length === 0) {
        console.warn('No data to render');
        return;
    }
    
    // Create chart
    createReportChart(data, metadata);
    
    // Create histogram with statistical analysis
    createHistogram(data);
    
    // Calculate and display statistics
    const stats = calculateStatistics(data, metadata);
    displayStatistics(stats);
    
    // Evaluate and display achievements
    const achievements = evaluateAchievements(data, stats, metadata);
    displayAchievements(achievements);

    // ── Gamification hook ──
    if (window.GamificationSystem) {
        GamificationSystem.onReportLoaded(data, metadata, stats);
    }
}

function displayMetadataInfo(metadata, data) {
    const container = document.getElementById('reportMetadata');
    
    // Calculate sequence info
    const sequenceCount = data && data.length > 0 ? data[data.length - 1].sequence + 1 : 1;
    const totalDuration = data && data.length > 0 
        ? ((data[data.length - 1].adjusted_elapsed_ms - data[0].adjusted_elapsed_ms) / 1000).toFixed(1)
        : '0';
    const dataPoints = data ? data.length : 0;
    
    // Highlight if multiple sequences detected
    const sequenceClass = sequenceCount > 1 ? 'class="metadata-item highlight"' : 'class="metadata-item"';
    const sequenceNote = sequenceCount > 1 ? ` (${sequenceCount} separate recordings merged)` : '';
    
    container.innerHTML = `
        <div class="metadata-item"><strong>Subject:</strong> ${metadata.subject || 'N/A'}</div>
        <div class="metadata-item"><strong>Device:</strong> ${metadata.device_type || 'N/A'} (ID: ${metadata.device_id || 'N/A'})</div>
        <div class="metadata-item"><strong>Date:</strong> ${metadata.start_date || 'N/A'}</div>
        <div class="metadata-item"><strong>Time:</strong> ${metadata.start_time || 'N/A'}</div>
        <div class="metadata-item"><strong>Yellow Threshold:</strong> ${metadata.threshold_yellow || 'N/A'}°</div>
        <div class="metadata-item"><strong>Red Threshold:</strong> ${metadata.threshold_red || 'N/A'}°</div>
        <div class="metadata-item"><strong>Filter:</strong> ${metadata.filter_enabled || 'N/A'}</div>
        <div ${sequenceClass}><strong>Recording Segments:</strong> ${sequenceCount}${sequenceNote}</div>
        <div class="metadata-item"><strong>Total Duration:</strong> ${totalDuration}s</div>
        <div class="metadata-item"><strong>Data Points:</strong> ${dataPoints}</div>
    `;
}

function createReportChart(data, metadata) {
    const ctx = document.getElementById('reportChart');
    
    // Destroy existing chart if any
    if (window.reportChartInstance) {
        window.reportChartInstance.destroy();
    }
    
    const yellowThreshold = parseFloat(metadata.threshold_yellow) || 30;
    const redThreshold = parseFloat(metadata.threshold_red) || 60;
    
    // Prepare data - Calculate relative time from start of filtered data
    const startTime = data[0].adjusted_elapsed_ms;
    const timeLabels = data.map(d => ((d.adjusted_elapsed_ms - startTime) / 1000).toFixed(1));
    const angleData = data.map(d => d.angle);
    const feedbackData = data.map(d => d.feedback);
    const zoneData = data.map(d => d.zone);
    
    // Create background colors based on zone
    const backgroundColors = zoneData.map(zone => {
        if (zone === 'green') return 'rgba(76, 175, 80, 0.1)';
        if (zone === 'yellow') return 'rgba(255, 193, 7, 0.1)';
        if (zone === 'red') return 'rgba(244, 67, 54, 0.1)';
        return 'rgba(200, 200, 200, 0.1)';
    });
    
    // Create segment colors for line (based on vibration feedback)
    const lineColors = feedbackData.map(fb => fb > 0 ? 'rgba(156, 39, 176, 0.8)' : 'rgba(33, 150, 243, 0.8)');
    
    window.reportChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: timeLabels,
            datasets: [{
                label: 'Angle (°)',
                data: angleData,
                borderColor: 'rgb(33, 150, 243)',
                backgroundColor: 'rgba(33, 150, 243, 0.1)',
                borderWidth: 2,
                pointRadius: 1,
                pointHoverRadius: 4,
                tension: 0.1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio: 2.5,
            interaction: {
                intersect: false,
                mode: 'index'
            },
            plugins: {
                legend: {
                    display: true
                },
                tooltip: {
                    callbacks: {
                        afterLabel: function(context) {
                            const idx = context.dataIndex;
                            const zone = zoneData[idx];
                            const feedback = feedbackData[idx];
                            return `Zone: ${zone}\nFeedback: ${feedback ? 'ON' : 'OFF'}`;
                        }
                    }
                },
                annotation: {
                    annotations: createZoneAnnotations(data, yellowThreshold, redThreshold)
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Time (seconds)'
                    },
                    ticks: {
                        maxTicksLimit: 20
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Angle (degrees)'
                    },
                    beginAtZero: true,
                    suggestedMax: Math.max(redThreshold + 10, Math.max(...angleData) + 5)
                }
            }
        },
        plugins: [{
            id: 'backgroundZones',
            beforeDatasetsDraw: (chart) => {
                const ctx = chart.ctx;
                const chartArea = chart.chartArea;
                const meta = chart.getDatasetMeta(0);
                
                // Draw zone background
                for (let i = 0; i < data.length - 1; i++) {
                    const point = meta.data[i];
                    const nextPoint = meta.data[i + 1];
                    
                    if (!point || !nextPoint) continue;
                    
                    const zone = zoneData[i];
                    let color;
                    if (zone === 'green') color = 'rgba(76, 175, 80, 0.1)';
                    else if (zone === 'yellow') color = 'rgba(255, 193, 7, 0.2)';
                    else if (zone === 'red') color = 'rgba(244, 67, 54, 0.2)';
                    else color = 'rgba(200, 200, 200, 0.1)';
                    
                    ctx.fillStyle = color;
                    ctx.fillRect(point.x, chartArea.top, nextPoint.x - point.x, chartArea.bottom - chartArea.top);
                }
                
                // Draw feedback stripes
                for (let i = 0; i < data.length - 1; i++) {
                    const point = meta.data[i];
                    const nextPoint = meta.data[i + 1];
                    
                    if (!point || !nextPoint) continue;
                    
                    if (feedbackData[i] > 0) {
                        ctx.fillStyle = 'rgba(156, 39, 176, 0.3)';
                        ctx.fillRect(point.x, chartArea.top, nextPoint.x - point.x, chartArea.bottom - chartArea.top);
                    }
                }
            }
        }]
    });
}

function createZoneAnnotations(data, yellowThreshold, redThreshold) {
    // This would need Chart.js annotation plugin, which we'll skip for simplicity
    return {};
}

function createHistogram(data) {
    const ctx = document.getElementById('reportHistogram');
    
    // Destroy existing histogram if any
    if (window.reportHistogramInstance) {
        window.reportHistogramInstance.destroy();
    }
    
    // Extract angle data
    const angles = data.map(d => d.angle);
    
    // Calculate advanced statistics
    const stats = calculateAdvancedStatistics(angles);
    
    // Create histogram bins with 1-degree resolution
    const minAngle = Math.floor(Math.min(...angles));
    const maxAngle = Math.ceil(Math.max(...angles));
    const binSize = 1; // 1 degree bins
    const binCount = Math.ceil((maxAngle - minAngle) / binSize);
    
    // Initialize bins
    const bins = Array(binCount).fill(0);
    const binLabels = [];
    
    for (let i = 0; i < binCount; i++) {
        binLabels.push((minAngle + i * binSize).toFixed(0));
    }
    
    // Fill bins
    angles.forEach(angle => {
        const binIndex = Math.floor((angle - minAngle) / binSize);
        if (binIndex >= 0 && binIndex < binCount) {
            bins[binIndex]++;
        }
    });
    
    // Create histogram chart
    window.reportHistogramInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: binLabels,
            datasets: [{
                label: 'Frequency',
                data: bins,
                backgroundColor: 'rgba(33, 150, 243, 0.6)',
                borderColor: 'rgb(33, 150, 243)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio: 2.5,
            plugins: {
                legend: {
                    display: true
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const count = context.parsed.y;
                            const percentage = (count / angles.length * 100).toFixed(1);
                            return `Count: ${count} (${percentage}%)`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Angle (degrees)'
                    },
                    ticks: {
                        maxTicksLimit: 20
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Frequency (count)'
                    },
                    beginAtZero: true
                }
            }
        }
    });
    
    // Display histogram statistics
    displayHistogramStatistics(stats);
}

function calculateAdvancedStatistics(angles) {
    const n = angles.length;
    
    // Calculate mean
    const mean = angles.reduce((sum, val) => sum + val, 0) / n;
    
    // Calculate variance
    const squaredDiffs = angles.map(val => Math.pow(val - mean, 2));
    const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / n;
    
    // Calculate standard deviation
    const stdDev = Math.sqrt(variance);
    
    // Calculate skewness
    // Skewness = E[(X - μ)³] / σ³
    const cubedDiffs = angles.map(val => Math.pow(val - mean, 3));
    const skewness = (cubedDiffs.reduce((sum, val) => sum + val, 0) / n) / Math.pow(stdDev, 3);
    
    // Calculate median
    const sortedAngles = [...angles].sort((a, b) => a - b);
    const median = n % 2 === 0
        ? (sortedAngles[n / 2 - 1] + sortedAngles[n / 2]) / 2
        : sortedAngles[Math.floor(n / 2)];
    
    // Calculate mode (most frequent value)
    const frequency = {};
    let maxFreq = 0;
    let mode = null;
    
    angles.forEach(angle => {
        const rounded = Math.round(angle);
        frequency[rounded] = (frequency[rounded] || 0) + 1;
        if (frequency[rounded] > maxFreq) {
            maxFreq = frequency[rounded];
            mode = rounded;
        }
    });
    
    // Calculate percentiles
    const p25 = sortedAngles[Math.floor(n * 0.25)];
    const p75 = sortedAngles[Math.floor(n * 0.75)];
    const p90 = sortedAngles[Math.floor(n * 0.90)];
    
    return {
        mean: mean.toFixed(2),
        median: median.toFixed(2),
        mode: mode,
        variance: variance.toFixed(2),
        stdDev: stdDev.toFixed(2),
        skewness: skewness.toFixed(3),
        min: Math.min(...angles).toFixed(2),
        max: Math.max(...angles).toFixed(2),
        p25: p25.toFixed(2),
        p75: p75.toFixed(2),
        p90: p90.toFixed(2),
        count: n
    };
}

function displayHistogramStatistics(stats) {
    const container = document.getElementById('histogramStats');
    
    // Interpret skewness
    let skewnessInterpretation = '';
    const skew = parseFloat(stats.skewness);
    if (skew > 0.5) {
        skewnessInterpretation = 'Positively skewed: More time at lower angles';
    } else if (skew < -0.5) {
        skewnessInterpretation = 'Negatively skewed: More time at higher angles';
    } else {
        skewnessInterpretation = 'Approximately symmetric';
    }
    
    container.innerHTML = `
        <div class="histogram-stats-grid">
            <div class="hist-stat-card primary">
                <div class="hist-stat-label">Mean</div>
                <div class="hist-stat-value">${stats.mean}°</div>
            </div>
            <div class="hist-stat-card primary">
                <div class="hist-stat-label">Variance</div>
                <div class="hist-stat-value">${stats.variance}°²</div>
            </div>
            <div class="hist-stat-card primary">
                <div class="hist-stat-label">Skewness</div>
                <div class="hist-stat-value">${stats.skewness}</div>
            </div>
            <div class="hist-stat-card">
                <div class="hist-stat-label">Median</div>
                <div class="hist-stat-value">${stats.median}°</div>
            </div>
            <div class="hist-stat-card">
                <div class="hist-stat-label">Std Dev</div>
                <div class="hist-stat-value">${stats.stdDev}°</div>
            </div>
            <div class="hist-stat-card">
                <div class="hist-stat-label">Mode</div>
                <div class="hist-stat-value">${stats.mode}°</div>
            </div>
            <div class="hist-stat-card">
                <div class="hist-stat-label">Range</div>
                <div class="hist-stat-value">${stats.min}° - ${stats.max}°</div>
            </div>
            <div class="hist-stat-card">
                <div class="hist-stat-label">25th Percentile</div>
                <div class="hist-stat-value">${stats.p25}°</div>
            </div>
            <div class="hist-stat-card">
                <div class="hist-stat-label">75th Percentile</div>
                <div class="hist-stat-value">${stats.p75}°</div>
            </div>
            <div class="hist-stat-card">
                <div class="hist-stat-label">90th Percentile</div>
                <div class="hist-stat-value">${stats.p90}°</div>
            </div>
        </div>
        <div class="skewness-interpretation">
            <strong>Distribution Shape:</strong> ${skewnessInterpretation}
        </div>
    `;
}

function calculateStatistics(data, metadata) {
    const yellowThreshold = parseFloat(metadata.threshold_yellow) || 30;
    const redThreshold = parseFloat(metadata.threshold_red) || 60;
    
    let totalGreenTime = 0;
    let totalYellowTime = 0;
    let totalRedTime = 0;
    let greenAngles = [];
    let yellowAngles = [];
    let redAngles = [];
    
    // Track recovery events (yellow/red -> green)
    let recoveryEvents = [];
    let currentBadZoneStart = null;
    let currentBadZone = null;
    
    // Track green streaks
    let greenStreaks = [];
    let currentGreenStreak = 0;
    
    for (let i = 0; i < data.length; i++) {
        const point = data[i];
        const prevPoint = i > 0 ? data[i - 1] : null;
        const timeStep = prevPoint ? (point.adjusted_elapsed_ms - prevPoint.adjusted_elapsed_ms) / 1000 : 0;
        
        // Accumulate time and angles by zone
        if (point.zone === 'green') {
            totalGreenTime += timeStep;
            greenAngles.push(point.angle);
            currentGreenStreak += timeStep;
            
            // Check if recovering from bad zone
            if (prevPoint && (prevPoint.zone === 'yellow' || prevPoint.zone === 'red') && currentBadZoneStart !== null) {
                const recoveryTime = (point.adjusted_elapsed_ms - currentBadZoneStart) / 1000;
                recoveryEvents.push({
                    fromZone: currentBadZone,
                    recoveryTime: recoveryTime
                });
                currentBadZoneStart = null;
                currentBadZone = null;
            }
        } else {
            // End green streak
            if (currentGreenStreak > 0) {
                greenStreaks.push(currentGreenStreak);
                currentGreenStreak = 0;
            }
            
            if (point.zone === 'yellow') {
                totalYellowTime += timeStep;
                yellowAngles.push(point.angle);
                
                // Start tracking bad zone if coming from green
                if (prevPoint && prevPoint.zone === 'green') {
                    currentBadZoneStart = point.adjusted_elapsed_ms;
                    currentBadZone = 'yellow';
                }
            } else if (point.zone === 'red') {
                totalRedTime += timeStep;
                redAngles.push(point.angle);
                
                // Start or update bad zone tracking
                if (prevPoint && prevPoint.zone === 'green') {
                    currentBadZoneStart = point.adjusted_elapsed_ms;
                    currentBadZone = 'red';
                } else if (currentBadZone === 'yellow') {
                    currentBadZone = 'red'; // Escalated to red
                }
            }
        }
    }
    
    // Add final green streak if exists
    if (currentGreenStreak > 0) {
        greenStreaks.push(currentGreenStreak);
    }
    
    const totalTime = (data[data.length - 1].adjusted_elapsed_ms - data[0].adjusted_elapsed_ms) / 1000;
    const halfTime = totalTime / 2;
    
    // Calculate first half vs second half average
    const halfIndex = Math.floor(data.length / 2);
    const firstHalfAngles = data.slice(0, halfIndex).map(d => d.angle);
    const secondHalfAngles = data.slice(halfIndex).map(d => d.angle);
    
    const avgFirst = firstHalfAngles.reduce((a, b) => a + b, 0) / firstHalfAngles.length;
    const avgSecond = secondHalfAngles.reduce((a, b) => a + b, 0) / secondHalfAngles.length;
    
    // Calculate fastest recovery
    const fastestRecovery = recoveryEvents.length > 0 
        ? Math.min(...recoveryEvents.map(e => e.recoveryTime)) 
        : null;
    
    return {
        totalTime,
        totalGreenTime,
        totalYellowTime,
        totalRedTime,
        greenPercentage: (totalGreenTime / totalTime * 100).toFixed(1),
        yellowPercentage: (totalYellowTime / totalTime * 100).toFixed(1),
        redPercentage: (totalRedTime / totalTime * 100).toFixed(1),
        averageAngle: (data.reduce((sum, d) => sum + d.angle, 0) / data.length).toFixed(2),
        averageGreenAngle: greenAngles.length > 0 ? (greenAngles.reduce((a, b) => a + b, 0) / greenAngles.length).toFixed(2) : 'N/A',
        averageYellowAngle: yellowAngles.length > 0 ? (yellowAngles.reduce((a, b) => a + b, 0) / yellowAngles.length).toFixed(2) : 'N/A',
        averageRedAngle: redAngles.length > 0 ? (redAngles.reduce((a, b) => a + b, 0) / redAngles.length).toFixed(2) : 'N/A',
        recoveryCount: recoveryEvents.length,
        recoveryFromYellow: recoveryEvents.filter(e => e.fromZone === 'yellow').length,
        recoveryFromRed: recoveryEvents.filter(e => e.fromZone === 'red').length,
        fastestRecovery: fastestRecovery ? fastestRecovery.toFixed(1) : 'N/A',
        greenStreaks,
        longestGreenStreak: greenStreaks.length > 0 ? Math.max(...greenStreaks).toFixed(1) : 0,
        avgFirst: avgFirst.toFixed(2),
        avgSecond: avgSecond.toFixed(2),
        improvement: avgFirst > avgSecond
    };
}

function displayStatistics(stats) {
    const container = document.getElementById('reportStats');
    container.innerHTML = `
        <div class="stat-card">
            <div class="stat-label">Total Duration</div>
            <div class="stat-value">${stats.totalTime.toFixed(1)}s</div>
        </div>
        <div class="stat-card green-stat">
            <div class="stat-label">Green Zone Time</div>
            <div class="stat-value">${stats.totalGreenTime.toFixed(1)}s (${stats.greenPercentage}%)</div>
        </div>
        <div class="stat-card yellow-stat">
            <div class="stat-label">Yellow Zone Time</div>
            <div class="stat-value">${stats.totalYellowTime.toFixed(1)}s (${stats.yellowPercentage}%)</div>
        </div>
        <div class="stat-card red-stat">
            <div class="stat-label">Red Zone Time</div>
            <div class="stat-value">${stats.totalRedTime.toFixed(1)}s (${stats.redPercentage}%)</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Average Angle</div>
            <div class="stat-value">${stats.averageAngle}°</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Avg Angle in Green</div>
            <div class="stat-value">${stats.averageGreenAngle}°</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Recovery Events</div>
            <div class="stat-value">${stats.recoveryCount}</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Fastest Recovery</div>
            <div class="stat-value">${stats.fastestRecovery}s</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Longest Green Streak</div>
            <div class="stat-value">${stats.longestGreenStreak}s</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">First Half Avg</div>
            <div class="stat-value">${stats.avgFirst}°</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Second Half Avg</div>
            <div class="stat-value">${stats.avgSecond}°</div>
        </div>
        <div class="stat-card ${stats.improvement ? 'improvement' : ''}">
            <div class="stat-label">Trend</div>
            <div class="stat-value">${stats.improvement ? '✓ Improving' : '→ Steady'}</div>
        </div>
    `;
}

function evaluateAchievements(data, stats, metadata) {
    const achievements = [];
    
    // Green streak achievements
    if (stats.longestGreenStreak >= 60) {
        achievements.push({
            icon: '🏆',
            title: 'Green Master',
            description: `Maintained green zone for ${stats.longestGreenStreak}s continuously`,
            tier: 'gold'
        });
    } else if (stats.longestGreenStreak >= 30) {
        achievements.push({
            icon: '🥈',
            title: 'Green Keeper',
            description: `Maintained green zone for ${stats.longestGreenStreak}s`,
            tier: 'silver'
        });
    } else if (stats.longestGreenStreak >= 10) {
        achievements.push({
            icon: '🥉',
            title: 'Green Starter',
            description: `Maintained green zone for ${stats.longestGreenStreak}s`,
            tier: 'bronze'
        });
    }
    
    // Green percentage achievements
    if (parseFloat(stats.greenPercentage) >= 90) {
        achievements.push({
            icon: '🌟',
            title: 'Almost Perfect',
            description: `${stats.greenPercentage}% of time in green zone`,
            tier: 'gold'
        });
    } else if (parseFloat(stats.greenPercentage) >= 75) {
        achievements.push({
            icon: '⭐',
            title: 'Excellent Control',
            description: `${stats.greenPercentage}% of time in green zone`,
            tier: 'silver'
        });
    } else if (parseFloat(stats.greenPercentage) >= 50) {
        achievements.push({
            icon: '✨',
            title: 'Good Effort',
            description: `${stats.greenPercentage}% of time in green zone`,
            tier: 'bronze'
        });
    }
    
    // Recovery speed achievements
    if (stats.fastestRecovery !== 'N/A' && parseFloat(stats.fastestRecovery) <= 2) {
        achievements.push({
            icon: '⚡',
            title: 'Lightning Recovery',
            description: `Fastest recovery in ${stats.fastestRecovery}s`,
            tier: 'gold'
        });
    } else if (stats.fastestRecovery !== 'N/A' && parseFloat(stats.fastestRecovery) <= 5) {
        achievements.push({
            icon: '🔄',
            title: 'Quick Recovery',
            description: `Fast recovery in ${stats.fastestRecovery}s`,
            tier: 'silver'
        });
    }
    
    // Improvement achievement
    if (stats.improvement) {
        const improvement = ((stats.avgFirst - stats.avgSecond) / stats.avgFirst * 100).toFixed(1);
        achievements.push({
            icon: '📈',
            title: 'Progressive Improvement',
            description: `${improvement}% better in second half`,
            tier: 'gold'
        });
    }
    
    // Multiple recoveries
    if (stats.recoveryCount >= 10) {
        achievements.push({
            icon: '💪',
            title: 'Resilient',
            description: `Recovered ${stats.recoveryCount} times`,
            tier: 'silver'
        });
    }
    
    // Low average angle in green
    if (stats.averageGreenAngle !== 'N/A' && parseFloat(stats.averageGreenAngle) <= 10) {
        achievements.push({
            icon: '🎯',
            title: 'Precision',
            description: `Average ${stats.averageGreenAngle}° in green zone`,
            tier: 'gold'
        });
    }
    
    // Session duration
    if (stats.totalTime >= 300) {
        achievements.push({
            icon: '⏱️',
            title: 'Endurance',
            description: `Completed ${(stats.totalTime / 60).toFixed(1)} minute session`,
            tier: 'silver'
        });
    }
    
    return achievements;
}

function displayAchievements(achievements) {
    const container = document.getElementById('reportAchievements');
    
    if (achievements.length === 0) {
        container.innerHTML = '<p class="placeholder">Keep practicing to earn achievements!</p>';
        return;
    }
    
    container.innerHTML = achievements.map(ach => `
        <div class="achievement-card ${ach.tier}">
            <div class="achievement-icon">${ach.icon}</div>
            <div class="achievement-content">
                <div class="achievement-title">${ach.title}</div>
                <div class="achievement-description">${ach.description}</div>
            </div>
        </div>
    `).join('');
}

// Initialize report modal controls
document.addEventListener('DOMContentLoaded', () => {
    const reportModal = document.getElementById('reportModal');
    const reportModalClose = document.getElementById('reportModalClose');
    const closeReportBtn = document.getElementById('closeReportBtn');
    const exportReportBtn = document.getElementById('exportReportBtn');
    
    if (reportModalClose) {
        reportModalClose.addEventListener('click', () => {
            reportModal.classList.add('hidden');
        });
    }
    
    if (closeReportBtn) {
        closeReportBtn.addEventListener('click', () => {
            reportModal.classList.add('hidden');
        });
    }
    
    if (exportReportBtn) {
        exportReportBtn.addEventListener('click', () => {
            // TODO: Implement PDF export
            alert('Export functionality coming soon!');
        });
    }
});
