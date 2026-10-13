const vm = require('node:vm');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const source = fs.readFileSync(require('node:path').join(__dirname, '../lab-validation.js'), 'utf8');
function setup(options = {}) {
    const elements = new Map(), sent = [], intervals = [];
    let downloads = 0;
    const calibrated = {}, active = {}, feedback = {}, strength = {};
    const element = id => {
        if (!elements.has(id)) elements.set(id, {value:'validation', addEventListener(){}});
        return elements.get(id);
    };
    let context;
    context = vm.createContext({
        document:{getElementById:element, createElement:()=>({click(){downloads++;},remove(){}}),body:{appendChild(){}}},
        navigator:{}, localStorage:{getItem(){return null;},setItem(){}},
        performance:{now:()=>100},Date,Blob,TextEncoder,TextDecoder,
        URL:{createObjectURL(){return 'blob:test';},revokeObjectURL(){}},
        setTimeout(...args){const timer=setTimeout(...args);timer.unref();return timer;},clearTimeout,setInterval(fn,ms){intervals.push({fn,ms});},window:{addEventListener(){}},
        mockWrite(key,bytes) {
            const command = new TextDecoder().decode(bytes);
            sent.push({key,command});
            const d = vm.runInContext(`labDevices.find(d=>d.key==='${key}')`, context);
            let response;
            if (command === '?') response = `ACK:?:ID=1,T=${key==='trunk'?'BACK':'ARM'},C=${options.uncalibrated && !calibrated[key] ? 0 : 1},SD=${options.noSD===key?0:1},FB=${feedback[key]===false?0:1},INT=${strength[key]||6},DRV=${options.driverMissing?0:1},VT=${options.oldMotor?0:1},REC=${(active[key] ?? options.activeSession) ? 1 : 0},${options.oldFirmware?'':'START=1,DROP=0'}`;
            else if (command === 'F' || command === 'N') { feedback[key] = command === 'F'; response = `ACK:${command}:OK`; }
            else if (['W','M','S'].includes(command)) { strength[key] = ({W:4,M:6,S:8})[command]; response = `ACK:${command}:OK`; }
            else if (command.startsWith('VIBTEST:')) response = options.driverMissing ? 'ERROR:VIBTEST:Vibration driver not detected' : 'ACK:VIBTEST:Running';
            else if (command === 'C') { calibrated[key] = true; active[key] = true; response = options.failCalibration === key ? 'ERROR:C:Calibration failed' : 'ACK:C:Calibrated'; }
            else if (command === 'START') { active[key] = options.failStart !== key; response = options.failStart===key ? 'ERROR:START:SD start failed' : 'ACK:START:VA_001.CSV'; }
            else if (command === 'K') { if (options.failStop !== key) active[key] = false; response = options.failStop===key ? 'ERROR:K:SD save failed' : 'ACK:K:VA_001.CSV'; }
            else response = `ACK:${command.split(':')[0]}:OK`;
            queueMicrotask(()=>context.labNotification(d,response));
            return Promise.resolve();
        }
    });
    vm.runInContext(source,context);
    vm.runInContext(`labDevices.forEach(d=>{d.connected=true;d.ready=true;d.device={id:d.key};d.command={writeValue:bytes=>mockWrite(d.key,bytes)};d.characteristic={readValue:async()=>new DataView(Uint8Array.of(42).buffer)}});labUpdate();`,context);
    return {context,sent,element,downloads:()=>downloads,run:code=>vm.runInContext(code,context)};
}
(async()=>{
    let t=setup();
    await t.run('labStartRecording()');
    assert.equal(t.run('labRecording'),true);
    assert.equal(t.sent.filter(s=>s.command==='START').length,3);
    assert.equal(t.sent.filter(s=>s.command==='F').length,3);
    assert.ok(t.sent.findIndex(s=>s.command==='F') > t.sent.map(s=>s.command).lastIndexOf('START'));
    assert.ok(!t.sent.some(s=>['C','A','B'].includes(s.command)));
    await t.run('Promise.all(labDevices.map(labPoll))');
    assert.equal(t.run('labRows.length'),3);
    await t.run('labStop()');
    assert.equal(t.run('labRecording'),false);
    assert.equal(t.sent.filter(s=>s.command==='K').length,3);
    assert.equal(t.downloads(),1);
    assert.match(t.element('message').textContent,/confirmed/);
    // A second trial starts new SD sessions without recalibration.
    await t.run('labStartRecording()');await t.run('labStop()');
    assert.equal(t.sent.filter(s=>s.command==='START').length,6);
    assert.equal(t.sent.filter(s=>s.command==='F').length,6);
    for(const options of [{noSD:'trunk'},{oldFirmware:true}]) {
        t=setup(options);await t.run('labStartRecording()');
        assert.equal(t.run('labRecording'),false);
        assert.equal(t.sent.filter(s=>s.command==='START').length,0);
    }
    t=setup({failStart:'right_arm'});await t.run('labStartRecording()');
    assert.equal(t.run('labRecording'),false);
    assert.equal(t.sent.filter(s=>s.command==='K').length,3);
    assert.match(t.element('message').textContent,/Start failed/);
    t=setup({failStop:'trunk'});await t.run('labStartRecording()');await t.run('labStop()');
    assert.match(t.element('message').textContent,/NOT confirmed/);
    assert.equal(t.element('start').disabled,true);
    assert.equal(t.element('stop').disabled,false);
    t=setup();await t.run('labStartRecording()');
    t.run('labDisconnect(labDevices[0])');
    await new Promise(resolve=>setTimeout(resolve,20));
    assert.equal(t.run('labRecording'),false);
    assert.equal(t.sent.filter(s=>s.command==='K').length,2);
    assert.match(t.element('message').textContent,/NOT confirmed/);
    t=setup({uncalibrated:true});
    await t.run('labCalibrate()');
    assert.equal(t.sent.filter(s=>s.command==='A').length,2);
    assert.equal(t.sent.filter(s=>s.command==='B').length,1);
    assert.equal(t.sent.filter(s=>s.command==='C').length,3);
    assert.equal(t.sent.filter(s=>s.command==='K').length,3);
    assert.equal(t.element('start').disabled,false);
    assert.match(t.element('message').textContent,/All three sensors calibrated/);
    const before=t.sent.length;
    await t.run('labStartRecording()');
    await t.run('labCalibrate()');
    assert.ok(!t.sent.slice(before).some(s=>['A','B','C'].includes(s.command)));
    assert.equal(t.element('calibrate').disabled,true);
    await t.run('labStop()');
    t=setup({failCalibration:'trunk'});await t.run('labCalibrate()');
    assert.equal(t.element('start').disabled,false);
    assert.match(t.element('message').textContent,/Calibration not confirmed/);
    t=setup({oldFirmware:true});await t.run('labCalibrate()');
    assert.ok(!t.sent.some(s=>['A','B','C'].includes(s.command)));
    t=setup({activeSession:true});
    t.run('labDevices.forEach(d=>d.needsStop=true);labUpdate()');
    assert.equal(t.element('calibrate').disabled,false);
    await t.run('labCalibrate()');
    assert.match(t.element('message').textContent,/All three sensors calibrated/);
    assert.equal(t.sent.filter(s=>s.command==='K').length,6);
    for (const key of ['left_arm','right_arm','trunk']) {
        const commands=t.sent.filter(s=>s.key===key).map(s=>s.command);
        assert.ok(commands.indexOf('K')<commands.indexOf(key==='trunk'?'B':'A'));
    }
    t=setup({activeSession:true,failStop:'trunk'});
    await t.run('labCalibrate()');
    assert.ok(!t.sent.some(s=>['A','B','C'].includes(s.command)));
    assert.match(t.element('message').textContent,/NOT confirmed/);
    t=setup();t.run('labDevices[1].connected=false;labUpdate()');
    assert.equal(t.element('calibrate').disabled,true);
    assert.match(t.element('calibration-help').textContent,/Right Arm/);
    // Cached readiness must not trap a healthy, connected sensor after stop.
    t=setup();t.run('labDevices.forEach(d=>d.ready=false);labUpdate()');
    assert.equal(t.element('start').disabled,false);
    await t.run('labStartRecording()');
    assert.equal(t.run('labRecording'),true);
    await t.run('labStop()');
    t.run('labDevices[0].ready=false;labUpdate()');
    assert.equal(t.element('start').disabled,false);
    await t.run('labStartRecording()');
    assert.equal(t.run('labRecording'),true);
    assert.ok(!t.sent.some(s=>['A','B','C'].includes(s.command)));
    await t.run('labStop()');
    t=setup({noSD:'trunk'});t.run('labDevices.forEach(d=>d.ready=false);labUpdate()');
    await t.run('labStartRecording()');
    assert.equal(t.run('labRecording'),false);
    assert.equal(t.sent.filter(s=>s.command==='START').length,0);
    t=setup();await t.run("labVibration(labDevices[0], 'strength', 'S')");
    assert.equal(t.element('left_arm-strength').value,'S');
    await t.run("labVibration(labDevices[0], 'feedback', 'N')");
    assert.equal(t.run('labDevices[0].feedbackMode'),'N');
    await t.run('labStartRecording()');
    assert.equal(t.run('labRecording'),true);
    assert.equal(t.sent.filter(s=>s.key==='left_arm'&&s.command==='F').length,0);
    assert.equal(t.element('left_arm-test').disabled,true);
    const beforeTest=t.sent.length;await t.run("labVibration(labDevices[0], 'test', 'STEADY')");
    assert.equal(t.sent.length,beforeTest);
    await t.run('labStop()');
    t=setup({driverMissing:true});
    t.run("labApplyStatus(labDevices[0], 'ACK:?:T=ARM,C=1,SD=1,REC=0,START=1,DROP=0,DRV=0,VT=1')");
    await t.run("labVibration(labDevices[0], 'test', 'STEADY')");
    assert.match(t.element('message').textContent,/driver not detected/);
    console.log('PASS: per-sensor strength and feedback choice, preferred Off preserved at start, motor tests blocked during recording, driver-error reporting; stale readiness recovery and fresh SD checks before repeat recordings; active-session calibration enabled, prior SD save before calibration, failed-save guard, missing-sensor guidance; calibration with setup-session stop, calibration failure and recording guard; SD-confirmed start/stop, repeat trials, no calibration commands, SD/old-firmware rejection, partial-start rollback, failed-save retry, disconnect handling.');
})().catch(error=>{console.error(error);process.exitCode=1;});
