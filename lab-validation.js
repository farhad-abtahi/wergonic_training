'use strict';
// Only the explicit calibration action sends A/B/C. START preserves calibration.
const LAB_SERVICE = '34802252-7185-4d5d-b431-630e7050e8f0';
const LAB_ARM = '872a73a9-ad52-47f3-8622-10e06c24c65f';
const LAB_TRUNK = '4d3a9874-27e5-11ee-be56-0242ac120002';
const LAB_TRANSFER = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';
const LAB_STORAGE = 'wergonic_lab_validation_v1';
const labDevices = [
    {key: 'left_arm', label: 'Left Arm', uuid: LAB_ARM, feedbackMode: 'F'},
    {key: 'right_arm', label: 'Right Arm', uuid: LAB_ARM, feedbackMode: 'F'},
    {key: 'trunk', label: 'Trunk', uuid: LAB_TRUNK, feedbackMode: 'F'}
];
let labRecording = false, labStart = 0, labWall = 0, labRows = [], labTrial = '', labStorageFailed = false, labTransition = false;
const labEl = id => document.getElementById(id);
const labMessage = text => { labEl('message').textContent = text; };
function labUpdate() {
    const count = labDevices.filter(d => d.connected).length;
    labEl('connected').textContent = `${count} / 3`;
    labEl('calibrate').disabled = labRecording || labTransition || count !== 3 || labDevices.some(d => d.busy || d.vibBusy);
    const missing = labDevices.filter(d => !d.connected).map(d => d.label);
    labEl('calibration-help').textContent = labRecording ? 'Stop recording before calibrating.'
        : labTransition ? 'Please wait for the current operation to finish.'
        : labDevices.some(d => d.busy) ? 'Wait for sensor pairing to finish.'
        : missing.length ? `Pair ${missing.join(', ')} to enable all-sensor calibration. Connected sensors can be calibrated individually.`
        : labDevices.some(d => d.needsStop) ? 'Calibration will first stop and save existing SD sessions.'
        : 'Calibrate a connected sensor from its card, or pair all three to calibrate them together.';
    labEl('start').disabled = labRecording || labTransition || count !== 3 || labDevices.some(d => d.busy || d.needsStop || d.vibBusy);
    labEl('stop').disabled = labTransition || (!labRecording && !labDevices.some(d => d.needsStop));
    labEl('save').disabled = labRecording || labTransition || !labRows.length;
    labEl('trial').disabled = labRecording || labTransition;
    labEl('samples').textContent = labRows.length;
    labEl('state').textContent = labRecording ? 'Recording' : (labRows.length ? 'Stopped' : 'Ready');
    for (const d of labDevices) {
        labEl(`${d.key}-pair`).disabled = labRecording || labTransition || d.busy || d.vibBusy;
        labEl(`${d.key}-pair`).textContent = d.connected ? 'Disconnect' : 'Pair Sensor';
        labEl(`${d.key}-calibrate`).disabled = labRecording || labTransition || !d.connected || d.busy || d.vibBusy;
        const status = labEl(`${d.key}-status`);
        status.textContent = d.busy ? 'Pairing…' : d.connected ? 'Connected' : 'Disconnected';
        for (const control of ['feedback','strength']) labEl(`${d.key}-${control}`).disabled = !d.connected || labTransition || d.busy || d.vibBusy;
        for (const control of ['pattern','test']) labEl(`${d.key}-${control}`).disabled = !d.connected || labRecording || labTransition || d.busy || d.vibBusy || d.needsStop || !d.testSupported;
        status.className = `lab-status${d.connected ? ' connected' : ''}`;
    }
}
function labPersist() {
    if (!labRows.length) return;
    try { localStorage.setItem(LAB_STORAGE, JSON.stringify({trial:labTrial, wall:labWall, rows:labRows})); }
    catch (_) { if (!labStorageFailed) labMessage('Browser backup unavailable. Stop and save CSV before leaving this page.'); labStorageFailed = true; }
}
function labDisconnect(d) {
    d.ready = false;
    if (d.pending) d.pending.reject(new Error('Bluetooth disconnected'));
    if (labRecording) d.needsStop = true;
    d.connected = false;
    clearTimeout(d.timer);
    labEl(`${d.key}-value`).textContent = '—';
    labEl(`${d.key}-last`).textContent = 'No live reading';
    labEl(`${d.key}-sd`).textContent = d.needsStop ? 'SD stop unconfirmed — reconnect to stop' : 'SD status unavailable';
    if (labRecording && !labTransition) labStop();
    labUpdate();
}
async function labPair(d) {
    if (d.connected) { d.device.gatt.disconnect(); labDisconnect(d); return; }
    if (!navigator.bluetooth) { labMessage('Web Bluetooth is unavailable. Open this page in a Bluetooth-enabled browser on localhost or HTTPS.'); return; }
    d.busy = true; labUpdate();
    let selected;
    try {
        selected = await navigator.bluetooth.requestDevice({filters:[{services:[LAB_SERVICE]}]});
        if (labDevices.some(other => other !== d && other.device && other.device.id === selected.id)) throw new Error('This sensor is already assigned to another body position. Choose a different sensor.');
        const server = await selected.gatt.connect();
        const service = await server.getPrimaryService(LAB_SERVICE);
        const characteristic = await service.getCharacteristic(d.uuid);
        d.command = await service.getCharacteristic(LAB_SERVICE);
        d.transfer = await service.getCharacteristic(LAB_TRANSFER);
        if (d.notificationHandler) d.transfer.removeEventListener('characteristicvaluechanged', d.notificationHandler);
        d.notificationHandler = event => labNotification(d, new TextDecoder().decode(event.target.value));
        d.transfer.addEventListener('characteristicvaluechanged', d.notificationHandler);
        await d.transfer.startNotifications();
        d.device = selected; d.characteristic = characteristic; d.connected = true;
        if (d.disconnectHandler) selected.removeEventListener('gattserverdisconnected', d.disconnectHandler);
        d.disconnectHandler = () => labDisconnect(d);
        selected.addEventListener('gattserverdisconnected', d.disconnectHandler);
        labEl(`${d.key}-device`).textContent = selected.name || selected.id;
        const status = await labCommand(d, '?');
        labApplyStatus(d, status);
        labMessage(d.ready ? `${d.label} connected. SD ready; current calibration retained.` : `${d.label}: SD recording unavailable. Requires firmware 4.6, healthy SD and existing calibration.`);
        labPoll(d);
    } catch (error) {
        if (selected && !labDevices.some(other => other !== d && other.device?.id === selected.id)) selected.gatt.disconnect();
        d.connected = false; d.ready = false;
        labMessage(`Could not pair ${d.label}: ${error.message}`);
    } finally { d.busy = false; labUpdate(); }
}
async function labPoll(d) {
    if (!d.connected) return;
    if (d.paused) { d.timer = setTimeout(() => labPoll(d), 40); return; }
    const characteristic = d.characteristic;
    const recordingStart = labStart;
    const wasRecording = labRecording;
    try {
        d.read = characteristic.readValue();
        const value = await d.read;
        if (!d.connected || characteristic !== d.characteristic) return;
        if (!value.byteLength) throw new Error('Empty sensor reading');
        const angle = value.getUint8(0); // Same unsigned degree encoding as Live Record.
        labEl(`${d.key}-value`).textContent = `${angle}°`;
        labEl(`${d.key}-last`).textContent = `Updated ${new Date().toLocaleTimeString('en-GB')}`;
        if (wasRecording && labRecording && recordingStart === labStart) {
            const elapsed = Math.round(performance.now() - labStart);
            labRows.push({elapsed, utc:new Date(labWall + elapsed).toISOString(), sensor:d.key, device:d.device.id, angle});
            labEl('samples').textContent = labRows.length;
        }
    } catch (error) {
        if (d.connected) labEl(`${d.key}-last`).textContent = `Read failed: ${error.message}`;
    } finally {
        // Schedule only after completion to avoid overlapping GATT reads.
        if (d.connected && characteristic === d.characteristic) d.timer = setTimeout(() => labPoll(d), 40);
    }
}
function labNotification(d, text) {
    if (d.pending && (text.startsWith(`ACK:${d.pending.prefix}:`) || text.startsWith(`ERROR:${d.pending.prefix}:`))) {
        if (text.startsWith('ERROR:')) d.pending.reject(new Error(text));
        else d.pending.resolve(text);
    }
    if (text.startsWith('ERROR:SD:')) {
        d.ready = false;
        labEl(`${d.key}-sd`).textContent = text;
        if (labRecording && !labTransition) labStop();
    }
}
function labCommand(d, command) {
    const previous = d.commandCompletion || Promise.resolve();
    const task = previous.catch(() => {}).then(() => labExecuteCommand(d, command));
    d.commandCompletion = task.catch(() => {});
    return task;
}
async function labExecuteCommand(d, command) {
    if (!d.connected) throw new Error(`${d.label}: Bluetooth disconnected`);
    if (d.pending) throw new Error(`${d.label}: command already pending`);
    d.paused = true;
    let timeout;
    try {
        // A stuck read must not block stop indefinitely or overlap GATT writes.
        if (d.read) await Promise.race([d.read.catch(() => {}), new Promise((_, reject) => {
            timeout = setTimeout(() => reject(new Error('Sensor read stalled; reconnect to stop')), 3000);
        })]);
        clearTimeout(timeout);
        const prefix = command.includes(':') ? command.split(':')[0] : command;
        const completion = new Promise((resolve, reject) => {
            const finish = (fn, value) => { clearTimeout(timeout); d.pending = null; fn(value); };
            d.pending = {prefix, resolve: value => finish(resolve, value), reject: error => finish(reject, error)};
            timeout = setTimeout(() => d.pending?.reject(new Error(`${d.label}: ${prefix} confirmation timed out`)), 10000);
            d.command.writeValue(new TextEncoder().encode(command)).catch(error => d.pending?.reject(error));
        });
        d.pendingCompletion = completion.catch(() => {});
        return await completion;
    } finally { clearTimeout(timeout); d.paused = false; }
}
function labApplyStatus(d, response) {
    const fields = Object.fromEntries(response.slice(6).split(',').map(field => field.split('=')));
    d.ready = fields.START === '1' && fields.C === '1' && fields.SD === '1' && fields.DROP === '0' && fields.T === (d.key === 'trunk' ? 'BACK' : 'ARM');
    d.needsStop = d.needsStop || fields.REC === '1';
    labEl(`${d.key}-sd`).textContent = d.ready ? (fields.REC === '1' ? 'SD recording active' : 'SD ready') : 'SD / calibration / body position / firmware not ready';
    d.testSupported = fields.VT === '1';
    if (fields.INT) labEl(`${d.key}-strength`).value = ({4:'W',6:'M',8:'S'})[fields.INT] || 'M';
    labEl(`${d.key}-feedback`).value = d.feedbackMode;
    labEl(`${d.key}-vib-status`).textContent = fields.DRV === '0' ? 'Driver not detected — check wiring / power.'
        : `Feedback: ${fields.FB === '1' ? 'On' : 'Off'} · Driver: ${fields.DRV === '1' ? 'Detected' : 'Unknown'}${d.testSupported ? '' : ' · Motor test requires firmware 4.8'}`;
    labUpdate();
    return fields;
}
async function labVibration(d, action, value) {
    if (!d.connected || labTransition || d.vibBusy) return;
    if (action === 'test' && (labRecording || d.needsStop || !d.testSupported)) return;
    d.vibBusy = true; labUpdate();
    try {
        if (action === 'test') {
            await labCommand(d, `VIBTEST:${value}`);
            labEl(`${d.key}-vib-status`).textContent = `Testing ${value === 'PULSE' ? 'double pulse' : 'steady vibration'}…`;
            await new Promise(resolve => setTimeout(resolve, 1500));
            labMessage(`${d.label}: motor test finished. If no vibration was felt with driver detected, check motor connection and power.`);
        } else {
            await labCommand(d, value);
            if (action === 'feedback') d.feedbackMode = value;
            labMessage(`${d.label}: ${action === 'feedback' ? 'feedback mode' : 'strength'} confirmed.`);
        }
        labApplyStatus(d, await labCommand(d, '?'));
    } catch (error) {
        labMessage(`${d.label}: vibration command failed: ${error.message}`);
        if (action === 'feedback') labEl(`${d.key}-feedback`).value = d.feedbackMode;
    } finally { d.vibBusy = false; labUpdate(); }
}
async function labCalibrate(target = null) {
    const devices = target ? [target] : labDevices;
    if (labRecording || labTransition || devices.some(d => !d.connected || d.busy || d.vibBusy)) return;
    labTransition = true; labUpdate();
    const subject = target ? target.label : 'all three sensors';
    labMessage(`Hold ${target ? 'this sensor' : 'all three sensors'} still in the reference pose. Calibrating ${subject}…`);
    try {
        const checks = await Promise.allSettled(devices.map(async d => {
            const fields = labApplyStatus(d, await labCommand(d, '?'));
            if (fields.START !== '1') throw new Error(`${d.label}: SD recording capability missing; update firmware.`);
            if (fields.SD !== '1') throw new Error(`${d.label}: SD unavailable (card error ${fields.SE || 'unknown'}, firmware ${fields.VER || 'unknown'}). Preserve files, check card and power, then restart the sensor.`);
        }));
        const checkFailure = checks.find(result => result.status === 'rejected');
        if (checkFailure) throw checkFailure.reason;
        // A restored or setup SD session should not make calibration unreachable.
        // Save it before A/B can change the type or calibration state.
        if (devices.some(d => d.needsStop)) {
            labMessage(`Stopping and saving existing SD session${target ? '' : 's'} before calibration…`);
            const previousStop = await labStopDevices(devices);
            if (devices.some(d => d.needsStop)) throw new Error(previousStop);
        }
        labMessage(`Hold ${target ? 'this sensor' : 'all three sensors'} still in the reference pose. Calibrating ${subject}…`);
        const calibrations = await Promise.allSettled(devices.map(async d => {
            d.ready = false;
            await labCommand(d, d.key === 'trunk' ? 'B' : 'A');
            d.needsStop = true; // C also starts an SD setup session, even if its ACK is lost.
            await labCommand(d, 'C');
        }));
        const stopResult = await labStopDevices(devices);
        const statuses = await Promise.allSettled(devices.map(async (d, index) => {
            const fields = labApplyStatus(d, await labCommand(d, '?'));
            if (calibrations[index].status === 'rejected') {
                d.ready = false;
                labEl(`${d.key}-sd`).textContent = 'Calibration acknowledgment missing; Start Recording will recheck sensor status.';
                throw calibrations[index].reason;
            }
            if (!d.ready || fields.REC !== '0' || d.needsStop)
                throw new Error(`${d.label}: calibration or SD setup stop not confirmed`);
        }));
        const failures = statuses.filter(result => result.status === 'rejected');
        if (failures.length) labMessage(`Calibration not confirmed: ${failures.map(result => result.reason.message).join('; ')}. ${stopResult}`);
        else labMessage(`${target ? `${target.label} calibrated` : 'All three sensors calibrated'}. Setup SD sessions saved and closed. Ready to start recording with these calibration values.`);
    } catch (error) {
        labMessage(`Calibration failed: ${error.message}`);
    } finally { labTransition = false; labUpdate(); }
}
async function labStartRecording() {
    if (labRecording || labTransition || labDevices.some(d => !d.connected || d.busy || d.needsStop || d.vibBusy)) return;
    labTransition = true; labUpdate(); labMessage('Checking SD cards and starting all three devices…');
    try {
        // Validate all three BEFORE starting any SD session.
        const checks = await Promise.allSettled(labDevices.map(async d => {
            const fields = labApplyStatus(d, await labCommand(d, '?'));
            if (!d.ready || fields.REC !== '0') throw new Error(`${d.label}: SD not ready or a session is already active. Stop first.`);
        }));
        const checkFailure = checks.find(result => result.status === 'rejected');
        if (checkFailure) throw checkFailure.reason;
        labTrial = labEl('trial').value.trim() || 'validation';
        const utc = new Date().toISOString().slice(0,19).replace(/[-:T]/g,'');
        const preparation = await Promise.allSettled(labDevices.map(async d => {
            const name = `${labTrial.replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,12)}_${d.key === 'left_arm' ? 'LA' : d.key === 'right_arm' ? 'RA' : 'TR'}`;
            await labCommand(d, `N:${name}`);
            await labCommand(d, `T:${utc}`);
        }));
        const prepareFailure = preparation.find(result => result.status === 'rejected');
        if (prepareFailure) throw prepareFailure.reason;
        labRows = []; labStart = performance.now(); labWall = Date.now();
        const starts = await Promise.allSettled(labDevices.map(async d => {
            d.needsStop = true; // Even a missing ACK may mean START reached the device.
            const response = await labCommand(d, 'START');
            d.sdFile = response.slice('ACK:START:'.length);
            labEl(`${d.key}-sd`).textContent = `SD recording: ${d.sdFile}`;
        }));
        const failure = starts.find(result => result.status === 'rejected');
        if (failure) throw failure.reason;
        if (labDevices.some(d => !d.connected || !d.ready)) throw new Error('A sensor lost SD readiness during start');
        // K silences feedback. Restore it explicitly for every new trial.
        // F changes feedback only; it does not touch calibration or thresholds.
        const feedback = await Promise.allSettled(labDevices.map(d => labCommand(d, d.feedbackMode)));
        const feedbackFailure = feedback.find(result => result.status === 'rejected');
        if (feedbackFailure) throw feedbackFailure.reason;
        labRecording = true; labEl('elapsed').textContent = '00:00:00';
        labMessage('All three SD recordings confirmed. Vibration feedback follows each sensor’s selected mode. Bluetooth CSV is a secondary backup. Calibration unchanged.');
    } catch (error) {
        const stops = await labStopDevices();
        labMessage(`Start failed: ${error.message}. ${stops}`);
    } finally { labTransition = false; labUpdate(); }
}
async function labStopDevices(devices = labDevices) {
    const results = await Promise.allSettled(devices.filter(d => d.needsStop).map(async d => {
        const response = await labCommand(d, 'K');
        d.needsStop = false;
        labEl(`${d.key}-sd`).textContent = `SD saved: ${response.slice(6)}`;
    }));
    const failures = results.filter(r => r.status === 'rejected');
    return failures.length ? `SD save NOT confirmed: ${failures.map(r => r.reason.message).join('; ')}. Reconnect if needed and retry Stop & Save.` : 'All requested SD stops and saves confirmed.';
}
function labCSVCell(value) { return `"${String(value).replace(/"/g, '""')}"`; }
function labCSV() {
    return ['trial,elapsed_ms,timestamp_utc,sensor,device_id,angle_deg', ...labRows.map(r =>
        [labTrial,r.elapsed,r.utc,r.sensor,r.device,r.angle].map(labCSVCell).join(','))].join('\r\n');
}
function labSave() {
    if (!labRows.length) { labMessage('No samples received. Nothing to save.'); return; }
    labPersist();
    const url = URL.createObjectURL(new Blob([labCSV()], {type:'text/csv;charset=utf-8'}));
    const a = document.createElement('a'); a.href = url;
    a.download = `${labTrial.replace(/[^a-zA-Z0-9_-]/g,'_')}_${new Date(labWall).toISOString().replace(/[:.]/g,'-')}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    labMessage(`CSV download requested: ${labRows.length} samples. Use Download Bluetooth CSV if needed.`);
}
async function labStop() {
    if (labTransition || (!labRecording && !labDevices.some(d => d.needsStop))) return;
    labTransition = true; labRecording = false; labUpdate(); labPersist();
    labMessage('Stopping sensors and flushing SD files…');
    try {
        await Promise.all(labDevices.map(d => d.pendingCompletion || Promise.resolve()));
        const result = await labStopDevices();
        if (labRows.length) labSave();
        labMessage(`${result} Bluetooth backup: ${labRows.length} samples.`);
    } finally { labTransition = false; labUpdate(); }
}
labEl('devices').innerHTML = labDevices.map(d => `<section class="lab-card" aria-label="${d.label}"><div class="lab-card-header"><h2>${d.label}</h2><div id="${d.key}-status" class="lab-status">Disconnected</div></div><div id="${d.key}-device" class="lab-device">No sensor paired</div><div class="lab-card-header"><div id="${d.key}-value" class="lab-value">—</div><div class="lab-card-actions"><button id="${d.key}-calibrate" disabled>Calibrate</button><button id="${d.key}-pair">Pair Sensor</button></div></div><small id="${d.key}-last">No live reading</small><small id="${d.key}-sd">SD status unavailable</small><div class="lab-vibration"><div class="lab-vibration-grid"><div><label for="${d.key}-feedback">Feedback mode</label><select id="${d.key}-feedback"><option value="F">Automatic / On</option><option value="N">Off</option></select></div><div><label for="${d.key}-strength">Strength</label><select id="${d.key}-strength"><option value="W">Weak</option><option value="M" selected>Medium</option><option value="S">Strong</option></select></div></div><label for="${d.key}-pattern" style="margin-top:8px">Test pattern (while stopped)</label><div class="lab-vibration-test"><select id="${d.key}-pattern"><option value="PULSE">Double pulse</option><option value="STEADY">Steady · 1.3 s</option></select><button id="${d.key}-test">Test Vibration</button></div><small id="${d.key}-vib-status">Pair sensor to check feedback.</small></div></section>`).join('');
for (const d of labDevices) {
    labEl(`${d.key}-pair`).addEventListener('click', () => labPair(d));
    labEl(`${d.key}-calibrate`).addEventListener('click', () => labCalibrate(d));
    labEl(`${d.key}-feedback`).addEventListener('change', event => labVibration(d, 'feedback', event.target.value));
    labEl(`${d.key}-strength`).addEventListener('change', event => labVibration(d, 'strength', event.target.value));
    labEl(`${d.key}-test`).addEventListener('click', () => labVibration(d, 'test', labEl(`${d.key}-pattern`).value));
}
labEl('calibrate').addEventListener('click', labCalibrate);
labEl('start').addEventListener('click', labStartRecording);
labEl('stop').addEventListener('click', labStop);
labEl('save').addEventListener('click', labSave);
try {
    const saved = JSON.parse(localStorage.getItem(LAB_STORAGE));
    if (saved && Array.isArray(saved.rows) && saved.rows.length) {
        labRows = saved.rows; labTrial = saved.trial; labWall = saved.wall;
        labEl('trial').value = labTrial;
        labMessage('Previous recording recovered. Download Bluetooth CSV before starting a new trial.');
    }
} catch (_) {}
labUpdate();
setInterval(() => {
    if (!labRecording) return;
    labEl('elapsed').textContent = new Date(performance.now() - labStart).toISOString().slice(11,19);
    labPersist();
}, 1000);
window.addEventListener('beforeunload', event => {
    if (!labRecording) return;
    labPersist(); event.preventDefault(); event.returnValue = '';
});

let labChecking = false;
setInterval(async () => {
    if (!labRecording || labTransition || labChecking) return;
    labChecking = true;
    try {
        const results = await Promise.allSettled(labDevices.map(async d => {
            const fields = labApplyStatus(d, await labCommand(d, '?'));
            if (!d.ready || fields.REC !== '1') throw new Error(`${d.label}: SD recording unhealthy`);
        }));
        if (results.some(result => result.status === 'rejected') && !labTransition) await labStop();
    } finally { labChecking = false; }
}, 2000);
