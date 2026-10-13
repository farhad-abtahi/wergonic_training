// Wergonic shared i18n engine + translation strings for the field-record and
// device-manager pages. Include via <script src="i18n.js"></script> after
// config.js. Usage on a page:
//   <span data-i18n="field.title">Recording</span>
//   <input data-i18n-placeholder="field.namePlaceholder" placeholder="...">
//   wergonicT('field.pairing')  // for strings built dynamically in JS
//
// Language is persisted in localStorage under 'wergonic-lang' ('en' | 'zh' |
// 'sv') and synced across same-origin tabs via the 'storage' event (same
// pattern as the theme toggle in app-shell.js).

const WERGONIC_LANGS = ['en', 'zh', 'sv'];

const WERGONIC_I18N_STRINGS = {
    // ── Shared ──────────────────────────────────────────────────────────
    'common.langToggle':      { en: 'EN', zh: '\u4e2d\u6587', sv: 'SV' },
    'common.home':            { en: '\u2302 Home', zh: '\u2302 \u4e3b\u9875', sv: '\u2302 Hem' },
    'common.connect':         { en: 'Connect', zh: '\u8fde\u63a5', sv: 'Anslut' },
    'common.disconnect':      { en: 'Disconnect', zh: '\u65ad\u5f00', sv: 'Koppla fr\u00e5n' },
    'common.connected':       { en: 'Connected', zh: '\u5df2\u8fde\u63a5', sv: 'Ansluten' },
    'common.notConnected':    { en: 'Not connected', zh: '\u672a\u8fde\u63a5', sv: 'Inte ansluten' },
    'common.reconnecting':    { en: 'Reconnecting…', zh: '\u91cd\u8fde\u4e2d…', sv: '\u00c5teransluter…' },
    'common.calibrate':       { en: 'Calibrate', zh: '\u6821\u51c6', sv: 'Kalibrera' },
    'common.calibrated':      { en: 'Calibrated ✓', zh: '\u5df2\u6821\u51c6 ✓', sv: 'Kalibrerad ✓' },
    'common.arm':             { en: 'ARM', zh: '\u624b\u81c2', sv: 'ARM' },
    'common.trunk':           { en: 'TRUNK', zh: '\u8eb1\u5e72', sv: 'B\u00c5L' },
    'common.bluetooth':       { en: 'Bluetooth', zh: '\u84dd\u7259', sv: 'Bluetooth' },
    'common.sdCard':          { en: 'SD Card', zh: 'SD\u5361', sv: 'SD-kort' },
    'common.available':       { en: 'Available', zh: '\u53ef\u7528', sv: 'Tillg\u00e4nglig' },
    'common.unavailable':     { en: 'Unavailable', zh: '\u4e0d\u53ef\u7528', sv: 'Otillg\u00e4nglig' },
    'common.unknown':         { en: 'Unknown', zh: '\u672a\u77e5', sv: 'Ok\u00e4nd' },
    'common.save':            { en: 'Save', zh: '\u4fdd\u5b58', sv: 'Spara' },
    'common.cancel':          { en: 'Cancel', zh: '\u53d6\u6d88', sv: 'Avbryt' },
    'common.close':           { en: 'Close', zh: '\u5173\u95ed', sv: 'St\u00e4ng' },
    'common.delete':          { en: 'Delete', zh: '\u5220\u9664', sv: 'Ta bort' },
    'common.refresh':         { en: 'Refresh', zh: '\u5237\u65b0', sv: 'Uppdatera' },
    'common.name':            { en: 'Name', zh: '\u59d3\u540d', sv: 'Namn' },
    'common.date':            { en: 'Date', zh: '\u65e5\u671f', sv: 'Datum' },
    'common.duration':        { en: 'Duration', zh: '\u65f6\u957f', sv: 'Varaktighet' },
    'common.device':          { en: 'Device', zh: '\u8bbe\u5907', sv: 'Enhet' },
    'common.weak':            { en: 'Weak', zh: '\u5f31', sv: 'Svag' },
    'common.medium':          { en: 'Medium', zh: '\u4e2d', sv: 'Medel' },
    'common.strong':          { en: 'Strong', zh: '\u5f3a', sv: 'Stark' },
    'common.webBleUnsupported': {
        en: 'Web Bluetooth is not supported. Use Chrome or Edge.',
        zh: '\u6b64\u6d4f\u89c8\u5668\u4e0d\u652f\u6301 Web Bluetooth\uff0c\u8bf7\u4f7f\u7528 Chrome \u6216 Edge\u3002',
        sv: 'Web Bluetooth st\u00f6ds inte. Anv\u00e4nd Chrome eller Edge.'
    },
    // Shared by dashboard.html / session-comparison-landscape.html (EN/SV only, no zh yet)
    'common.good':            { en: 'Good', sv: 'Bra' },
    'common.warning':         { en: 'Warning', sv: 'Varning' },
    'common.risk':            { en: 'Risk', sv: 'Risk' },
    'common.performanceScore':{ en: 'Performance Score', sv: 'Prestationspoäng' },
    'common.coachingFeedback':{ en: 'Coaching Feedback', sv: 'Coachningsåterkoppling' },
    'common.dataUnavailable': { en: 'Data unavailable', sv: 'Data ej tillgänglig' },
    'common.loading':         { en: 'Loading', sv: 'Laddar' },
    'common.best':            { en: 'Best', sv: 'Bäst' },
    'common.collapseExpand':  { en: 'Collapse/Expand', sv: 'Minimera/Expandera' },
    'common.angleOverTime':   { en: '📐 Angle Over Time', sv: '📐 Vinkel över tid' },

    // ── field-record.html (simple field-user page) ─────────────────────
    'field.title':            { en: 'Recording', zh: '\u8bb0\u5f55', sv: 'Inspelning' },
    'field.namePlaceholder':  { en: 'Subject name', zh: '\u53d7\u8bd5\u8005\u59d3\u540d', sv: 'F\u00f6rs\u00f6kspersonens namn' },
    'field.pair':             { en: 'Pair', zh: '\u914d\u5bf9', sv: 'Para ihop' },
    'field.paired':           { en: 'Paired', zh: '\u5df2\u914d\u5bf9', sv: 'Ihopparad' },
    'field.calibrating':      { en: 'Calibrating…', zh: '\u6821\u51c6\u4e2d…', sv: 'Kalibrerar…' },
    'field.start':            { en: '▶ Start', zh: '▶ \u5f00\u59cb', sv: '▶ Starta' },
    'field.pause':            { en: '⏸ Pause', zh: '⏸ \u6682\u505c', sv: '⏸ Pausa' },
    'field.resume':           { en: '▶ Resume', zh: '▶ \u7ee7\u7eed', sv: '▶ Forts\u00e4tt' },
    'field.stop':             { en: '⏹ Stop', zh: '⏹ \u7ec8\u6b62', sv: '⏹ Stoppa' },
    'field.notePlaceholder':  { en: 'Add a text note…', zh: '\u6dfb\u52a0\u6587\u5b57\u8bb0\u5f55…', sv: 'L\u00e4gg till en textanteckning…' },
    'field.noteSend':         { en: 'Send', zh: '\u53d1\u9001', sv: 'Skicka' },
    'field.noteSent':         { en: 'Note saved', zh: '\u8bb0\u5f55\u5df2\u4fdd\u5b58', sv: 'Anteckning sparad' },
    'field.noteFailed':       { en: 'Note failed', zh: '\u8bb0\u5f55\u5931\u8d25', sv: 'Anteckning misslyckades' },
    'field.noteEmpty':        { en: 'Enter text first', zh: '\u8bf7\u5148\u8f93\u5165\u6587\u5b57', sv: 'Skriv text f\u00f6rst' },
    'field.needName':         { en: 'Enter a subject name first', zh: '\u8bf7\u5148\u8f93\u5165\u53d7\u8bd5\u8005\u59d3\u540d', sv: 'Ange f\u00f6rs\u00f6kspersonens namn f\u00f6rst' },
    'field.needDevice':       { en: 'Connect at least one device first', zh: '\u8bf7\u5148\u8fde\u63a5\u81f3\u5c11\u4e00\u4e2a\u8bbe\u5907', sv: 'Anslut minst en enhet f\u00f6rst' },
    'field.timeSynced':       { en: 'Time synced', zh: '\u65f6\u95f4\u5df2\u540c\u6b65', sv: 'Tiden synkroniserad' },
    'field.ready':            { en: 'Ready', zh: '\u5c31\u7eea', sv: 'Redo' },
    'field.recording':        { en: 'Recording', zh: '\u8bb0\u5f55\u4e2d', sv: 'Spelar in' },
    'field.paused':           { en: 'Paused', zh: '\u5df2\u6682\u505c', sv: 'Pausad' },
    'field.stopped':          { en: 'Stopped', zh: '\u5df2\u7ec8\u6b62', sv: 'Stoppad' },
    'field.moreTools':        { en: 'More tools \u2192', zh: '\u66f4\u591a\u5de5\u5177 \u2192', sv: 'Fler verktyg \u2192' },

    // ── device-manager.html (advanced multi-device console) ────────────
    'mgr.title':              { en: 'Device & File Manager', zh: '\u8bbe\u5907\u4e0e\u6587\u4ef6\u7ba1\u7406', sv: 'Enhets- och filhantering' },
    'mgr.subtitle':           {
        en: 'Manage multiple devices, browse SD files, and track daily usage.',
        zh: '\u7ba1\u7406\u591a\u4e2a\u8bbe\u5907\u3001\u6d4f\u89c8 SD \u5361\u6587\u4ef6\u5e76\u8ffd\u8e2a\u6bcf\u65e5\u4f7f\u7528\u65f6\u957f\u3002',
        sv: 'Hantera flera enheter, bl\u00e4ddra i SD-filer och f\u00f6lj daglig anv\u00e4ndning.'
    },
    'mgr.addDevice':          { en: '+ Add Device', zh: '+ \u6dfb\u52a0\u8bbe\u5907', sv: '+ L\u00e4gg till enhet' },
    'mgr.removeDevice':       { en: 'Remove', zh: '\u79fb\u9664', sv: 'Ta bort' },
    'mgr.deviceLabel':        { en: 'Label', zh: '\u6807\u7b7e', sv: 'Etikett' },
    'mgr.deviceType':         { en: 'Type', zh: '\u7c7b\u578b', sv: 'Typ' },
    'mgr.config':             { en: 'Configuration', zh: '\u914d\u7f6e', sv: 'Konfiguration' },
    'mgr.thresholdMargin':    { en: 'Threshold margin', zh: '\u9608\u503c\u8fb9\u8ddd', sv: 'Tr\u00f6skelv\u00e4rde' },
    'mgr.filter':             { en: 'Complementary filter', zh: '\u4e92\u8865\u6ee4\u6ce2', sv: 'Komplement\u00e4rt filter' },
    'mgr.feedback':           { en: 'Vibration feedback', zh: '\u632f\u52a8\u53cd\u9988', sv: 'Vibrations\u00e5terkoppling' },
    'mgr.debug':              { en: 'Debug output', zh: '\u8c03\u8bd5\u8f93\u51fa', sv: 'Fels\u00f6kningsutdata' },
    'mgr.calibRestore':       { en: 'Restore calibration on boot', zh: '\u5f00\u673a\u81ea\u52a8\u6062\u590d\u6821\u51c6', sv: '\u00c5terst\u00e4ll kalibrering vid start' },
    'mgr.intensity':          { en: 'Vibration intensity', zh: '\u632f\u52a8\u5f3a\u5ea6', sv: 'Vibrationsstyrka' },
    'mgr.applyConfig':        { en: 'Apply Configuration', zh: '\u5e94\u7528\u914d\u7f6e', sv: 'Till\u00e4mpa konfiguration' },
    'mgr.files':              { en: 'SD Card Files', zh: 'SD\u5361\u6587\u4ef6', sv: 'Filer p\u00e5 SD-kort' },
    'mgr.refreshFiles':       { en: '\u21bb Refresh List', zh: '\u21bb \u5237\u65b0\u5217\u8868', sv: '\u21bb Uppdatera lista' },
    'mgr.noFiles':            { en: 'No files yet — connect a device and refresh.', zh: '\u6682\u65e0\u6587\u4ef6 — \u8bf7\u5148\u8fde\u63a5\u8bbe\u5907\u5e76\u5237\u65b0\u3002', sv: 'Inga filer \u00e4n — anslut en enhet och uppdatera.' },
    'mgr.download':           { en: 'Download', zh: '\u4e0b\u8f7d', sv: 'Ladda ner' },
    'mgr.usage':              { en: 'Daily Usage Tracking', zh: '\u6bcf\u65e5\u4f7f\u7528\u65f6\u957f\u8ffd\u8e2a', sv: 'Daglig anv\u00e4ndningssp\u00e5rning' },
    'mgr.usageSubtitle':      {
        en: 'Stored locally in this browser (per-device metadata log).',
        zh: '\u6570\u636e\u4fdd\u5b58\u5728\u672c\u5730\u6d4f\u89c8\u5668\u4e2d\uff08\u6309\u8bbe\u5907\u8bb0\u5f55\uff09\u3002',
        sv: 'Sparas lokalt i denna webbl\u00e4sare (metadatalogg per enhet).'
    },
    'mgr.clearUsage':         { en: 'Clear Log', zh: '\u6e05\u9664\u8bb0\u5f55', sv: 'Rensa logg' },
    'mgr.exportUsage':        { en: 'Export CSV', zh: '\u5bfc\u51fa CSV', sv: 'Exportera CSV' },
    'mgr.noUsage':            { en: 'No usage recorded yet.', zh: '\u5c1a\u65e0\u4f7f\u7528\u8bb0\u5f55\u3002', sv: 'Ingen anv\u00e4ndning registrerad \u00e4n.' },
    'mgr.totalToday':         { en: 'Total today', zh: '\u4eca\u65e5\u603b\u65f6\u957f', sv: 'Totalt idag' },
    'mgr.confirmClearUsage':  { en: 'Clear all locally stored usage records?', zh: '\u786e\u5b9a\u8981\u6e05\u9664\u6240\u6709\u672c\u5730\u4f7f\u7528\u8bb0\u5f55\u5417\uff1f', sv: 'Rensa alla lokalt sparade anv\u00e4ndningsposter?' },
    'mgr.confirmDelete':      { en: 'Delete this file from the SD card?', zh: '\u786e\u5b9a\u8981\u4ece SD \u5361\u5220\u9664\u8be5\u6587\u4ef6\u5417\uff1f', sv: 'Ta bort denna fil fr\u00e5n SD-kortet?' },
    'mgr.status':             { en: 'Status', zh: '\u72b6\u6001', sv: 'Status' },
    'mgr.subjectName':        { en: 'Subject name', zh: '\u53d7\u8bd5\u8005\u59d3\u540d', sv: 'F\u00f6rs\u00f6kspersonens namn' },
    'mgr.setSubject':         { en: 'Set', zh: '\u8bbe\u7f6e', sv: 'Ange' },
    'mgr.syncTime':           { en: 'Sync Time', zh: '\u540c\u6b65\u65f6\u95f4', sv: 'Synka tid' },

    // ── dashboard.html (session A/B comparison view) — EN/SV only ────────────
    'dash.scoringConfig':     { en: 'Scoring config', sv: 'Poängkonfiguration' },
    'dash.scoringMode':       { en: 'Scoring Mode', sv: 'Poängläge' },
    'dash.modeAngle':         { en: 'Angle', sv: 'Vinkel' },
    'dash.modeZone':          { en: 'Zone', sv: 'Zon' },
    'dash.applyRecalc':       { en: 'Apply & Recalc', sv: 'Tillämpa och räkna om' },
    'dash.sessionAArm':       { en: 'Session A Arm', sv: 'Session A Arm' },
    'dash.sessionATrunk':     { en: 'Session A Trunk', sv: 'Session A Bål' },
    'dash.sessionBArm':       { en: 'Session B Arm', sv: 'Session B Arm' },
    'dash.sessionBTrunk':     { en: 'Session B Trunk', sv: 'Session B Bål' },
    'dash.applyFiles':        { en: 'Apply Files', sv: 'Tillämpa filer' },
    'dash.waitingForFile':    { en: 'Waiting for file selection.', sv: 'Väntar på filval.' },
    'dash.sessionComparison': { en: 'Session Comparison', sv: 'Sessionsjämförelse' },
    'dash.scoreDetails':      { en: 'Score Details', sv: 'Poängdetaljer' },
    'dash.closeScoreDetails': { en: 'Close score details', sv: 'Stäng poängdetaljer' },
    'dash.viewScoreDetailsA': { en: 'View Session A score details', sv: 'Visa poängdetaljer för Session A' },
    'dash.viewScoreDetailsB': { en: 'View Session B score details', sv: 'Visa poängdetaljer för Session B' },
    'dash.final':             { en: 'Final', sv: 'Slutresultat' },
    'dash.formula':           { en: 'Formula', sv: 'Formel' },
    'dash.mode':              { en: 'Mode', sv: 'Läge' },
    'dash.green':             { en: 'Green', sv: 'Grön' },
    'dash.yellow':            { en: 'Yellow', sv: 'Gul' },
    'dash.red':               { en: 'Red', sv: 'Röd' },
    'dash.curveHint':         { en: 'Click to add · Drag to move · Right-click to remove', sv: 'Klicka för att lägga till · Dra för att flytta · Högerklicka för att ta bort' },
    'dash.legendAArm':        { en: 'A Arm', sv: 'A Arm' },
    'dash.legendATrunk':      { en: 'A Trunk', sv: 'A Bål' },
    'dash.legendBArm':        { en: 'B Arm', sv: 'B Arm' },
    'dash.legendBTrunk':      { en: 'B Trunk', sv: 'B Bål' },
    'dash.gradeExcellent':    { en: 'Excellent', sv: 'Utmärkt' },
    'dash.gradeImproving':    { en: 'Improving', sv: 'Förbättras' },
    'dash.gradeSteady':       { en: 'Steady', sv: 'Stabil' },
    'dash.gradeAtRisk':       { en: 'At Risk', sv: 'I riskzon' },
    'dash.partArm':           { en: 'Arm posture', sv: 'Armvinkel' },
    'dash.partTrunk':         { en: 'Trunk posture', sv: 'Bålvinkel' },
    'dash.partRisk':          { en: '{part} has repeated risk spikes. Focus on immediate posture correction.', sv: '{part} har återkommande risktoppar. Fokusera på omedelbar hållningskorrigering.' },
    'dash.partWarn':          { en: '{part} is mostly stable but drifts appear under load.', sv: '{part} är oftast stabil men avvikelser uppstår under belastning.' },
    'dash.partGood':          { en: '{part} remains mostly stable with low sustained deviation.', sv: '{part} förblir mestadels stabil med låg ihållande avvikelse.' },
    'dash.coachStable':       { en: 'Performance is stable. Keep this rhythm and maintain correction timing consistency.', sv: 'Prestationen är stabil. Behåll detta tempo och håll korrigeringstiming konsekvent.' },
    'dash.coachRecoveryGood': { en: 'Recovery speed is good. Next focus is reducing warning exposure before it escalates.', sv: 'Återhämtningshastigheten är god. Nästa fokus är att minska varningsexponeringen innan den eskalerar.' },
    'dash.coachFrequentRisk': { en: 'Frequent risk windows detected. Shorten correction loop and reduce prolonged non-neutral posture.', sv: 'Frekventa riskperioder upptäckta. Korta ner korrigeringscykeln och minska långvarig icke-neutral hållning.' },
    'dash.durationPrefix':    { en: 'Duration {time}', sv: 'Varaktighet {time}' },
    'dash.sessionLabel':      { en: 'Session {slot}', sv: 'Session {slot}' },
    'dash.sessionScoreDetail':{ en: 'Session {slot} Score Detail', sv: 'Poängdetaljer för Session {slot}' },
    'dash.scoreHint':         { en: '💡 Fix non-green posture ({pct}% of session) → up to +{pts} pts', sv: '💡 Åtgärda icke-grön hållning ({pct}% av sessionen) → upp till +{pts} poäng' },
    'dash.bestTime':          { en: 'Best {time}', sv: 'Bäst {time}' },
    'dash.needsFocusTime':    { en: 'Needs Focus {time}', sv: 'Behöver fokus {time}' },
    'dash.loadFailed':        { en: 'Load failed: {error}', sv: 'Inläsning misslyckades: {error}' },
    'dash.sessionFiles':      { en: 'Session {slot}: {arm} + {trunk}', sv: 'Session {slot}: {arm} + {trunk}' },

    // ── session-comparison-landscape.html (kiosk dashboard) — EN/SV only ────
    'land.scoreTooltip':      { en: '80+ Excellent / 60-79 Improving / <60 Needs Attention', sv: '80+ Utmärkt / 60-79 Förbättras / <60 Kräver uppmärksamhet' },
    'land.sessionStamp':      { en: 'Session · {files}', sv: 'Session · {files}' },
    'land.targetHint':        { en: 'Target: keep score above 80', sv: 'Mål: håll poängen över 80' },
    'land.hintLowRisk':       { en: 'Low ergonomic risk. Keep this consistency.', sv: 'Låg ergonomisk risk. Behåll denna konsekvens.' },
    'land.hintRaisePoints':   { en: 'Raise {n} more points to reach Excellent.', sv: 'Höj {n} poäng till för att nå Utmärkt.' },
    'land.hintReduceRisk':    { en: 'Reduce high-risk posture time first.', sv: 'Minska högriskhållningstid först.' },
    'land.progressExcellent': { en: 'Excellent zone: {score} / 100', sv: 'Utmärkt zon: {score} / 100' },
    'land.progressImproving': { en: 'Improving zone: {score} / 100', sv: 'Förbättringszon: {score} / 100' },
    'land.progressAttention': { en: 'Needs attention: {score} / 100', sv: 'Kräver uppmärksamhet: {score} / 100' },
    'land.todaysMission':     { en: "Today's Mission", sv: 'Dagens uppdrag' },
    'land.missionLoading':    { en: 'Loading...', sv: 'Laddar...' },
    'land.missionNone':       { en: 'No mission set. Open Teacher Control to assign one.', sv: 'Inget uppdrag inställt. Öppna Lärarkontroll för att tilldela ett.' },
    'land.missionDo':         { en: 'Do:', sv: 'Gör:' },
    'land.combinedPostureBlock': { en: 'Combined posture block', sv: 'Kombinerat hållningsblock' },
    'land.armPlusTrunk':      { en: 'Arm + Trunk', sv: 'Arm + Bål' },
    'land.mergedSummaryNote': { en: 'Two body regions are stacked into one report block.', sv: 'Två kroppsdelar sammanställs i ett rapportblock.' },
    'land.bodyLeft':          { en: 'Body Left', sv: 'Vänster kroppssida' },
    'land.armTitle':          { en: '🥾 Arm', sv: '🥾 Arm' },
    'land.trunkTitle':        { en: '🧍 Trunk', sv: '🧍 Bål' },
    'land.armFeedbackInitial':{ en: 'Control is stable. Keep the arm slightly closer to your torso.', sv: 'Kontrollen är stabil. Håll armen något närmare bålen.' },
    'land.armCoach':          { en: '🥾 Arm Coach', sv: '🥾 Armcoach' },
    'land.trunkFeedbackInitial': { en: 'Trunk Guardian is analyzing posture quality.', sv: 'Bålvakten analyserar hållningskvaliteten.' },
    'land.trunkGuardian':     { en: '🧍 Trunk Guardian', sv: '🧍 Bålvakten' },
    'land.armGoodMsg':        { en: 'Good control. Keep your arm a little closer to your body.', sv: 'Bra kontroll. Håll armen lite närmare kroppen.' },
    'land.armWarnMsg':        { en: 'There is some extra reach. Try to keep arm motion more compact.', sv: 'Det finns viss extra sträckning. Försök hålla armrörelsen mer kompakt.' },
    'land.armRiskMsg':        { en: 'Arm load is high. Prioritize reducing distance from the torso.', sv: 'Armbelastningen är hög. Prioritera att minska avståndet från bålen.' },
    'land.trunkGoodMsg':      { en: 'Trunk alignment is steady. Keep a neutral posture.', sv: 'Bålens position är stabil. Behåll en neutral hållning.' },
    'land.trunkWarnMsg':      { en: 'The trunk leans forward at times. Stay a bit more upright.', sv: 'Bålen lutar framåt ibland. Håll dig lite mer upprätt.' },
    'land.trunkRiskMsg':      { en: 'Trunk risk is elevated. Bring your torso back to neutral first.', sv: 'Bålrisken är förhöjd. För tillbaka överkroppen till neutralt läge först.' },
    'land.armZoneSplit':      { en: 'Arm Zone Split', sv: 'Armens zonfördelning' },
    'land.trunkZoneSplit':    { en: 'Trunk Zone Split', sv: 'Bålens zonfördelning' },
    'land.postureViewerTitle':{ en: 'Postural Viewer + Timeline', sv: 'Hållningsvy + tidslinje' },
    'land.playerSubtitleInitial': { en: 'Starts from the best posture segment. Click timeline slices to jump.', sv: 'Startar vid det bästa hållningssegmentet. Klicka på tidslinjen för att hoppa.' },
    'land.playerSubtitleFull':{ en: 'Starts at the best posture segment. Click timeline slices to jump. Expand for expert details.', sv: 'Startar vid det bästa hållningssegmentet. Klicka på tidslinjen för att hoppa. Expandera för expertdetaljer.' },
    'land.playerSubtitleFallback': { en: 'Trunk data is missing. Viewer is running in arm-only fallback mode.', sv: 'Båldata saknas. Visaren körs i reservläge med endast arm.' },
    'land.worstTag':          { en: 'Worst', sv: 'Sämst' },
    'land.needAttention':     { en: 'Need Attention', sv: 'Kräver uppmärksamhet' },
    'land.paused':            { en: 'Paused', sv: 'Pausad' },
    'land.playing':           { en: 'Playing', sv: 'Spelar upp' },
    'land.playPauseAria':     { en: 'play or pause', sv: 'spela upp eller pausa' },
    'land.seekAria':          { en: 'seek through the session', sv: 'sök genom sessionen' },
    'land.seekTip':           { en: 'Drag or click timeline', sv: 'Dra eller klicka på tidslinjen' },
    'land.bestTimeMarker':    { en: '⭐ Best {time}', sv: '⭐ Bäst {time}' },
    'land.needAttentionMarker': { en: '⚠️ Need Attention {time}', sv: '⚠️ Kräver uppmärksamhet {time}' },
    'land.viewMoreAnalysis':  { en: 'View More Analysis ▼', sv: 'Visa mer analys ▼' },
    'land.expertAnalysis':    { en: 'Expert Analysis', sv: 'Expertanalys' },
    'land.closeExpertAnalysis': { en: 'close expert analysis', sv: 'stäng expertanalys' },
    'land.postureSnapshots':  { en: 'Posture Snapshots', sv: 'Hållningsögonblick' },
    'land.detailedMetrics':   { en: 'Detailed Metrics', sv: 'Detaljerade mätvärden' },
    'land.armSource':         { en: 'Arm source', sv: 'Armkälla' },
    'land.trunkSource':       { en: 'Trunk source', sv: 'Bålkälla' },
    'land.rawData':           { en: 'Raw Data', sv: 'Rådata' },
    'land.sessionNotes':      { en: 'Session Notes', sv: 'Sessionsanteckningar' },
    'land.overlayNoteInitial':{ en: 'Expanded view shows posture snapshots, detailed metrics, and raw data.', sv: 'Utökad vy visar hållningsögonblick, detaljerade mätvärden och rådata.' },
    'land.overlayNoteFull':   { en: 'The expert panel opens as an overlay and keeps the page height fixed.', sv: 'Expertpanelen öppnas som ett overlay och håller sidhöjden fast.' },
    'land.snapshotStart':     { en: 'Start', sv: 'Start' },
    'land.snapshotMid':       { en: 'Mid', sv: 'Mitt' },
    'land.snapshotEnd':       { en: 'End', sv: 'Slut' },
    'land.metricScore':       { en: 'Score', sv: 'Poäng' },
    'land.metricArmGreen':    { en: 'Arm green', sv: 'Arm grön' },
    'land.metricArmRed':      { en: 'Arm red', sv: 'Arm röd' },
    'land.metricTrunkGreen':  { en: 'Trunk green', sv: 'Bål grön' },
    'land.metricBestSegment': { en: 'Best segment', sv: 'Bästa segment' },
    'land.metricRecovery':    { en: 'Recovery', sv: 'Återhämtning' },
    'land.tableTime':         { en: 'Time', sv: 'Tid' },
    'land.tableArm':          { en: 'Arm', sv: 'Arm' },
    'land.tableTrunk':        { en: 'Trunk', sv: 'Bål' },
    'land.tableArmZone':      { en: 'Arm Zone', sv: 'Armzon' },
    'land.tableTrunkZone':    { en: 'Trunk Zone', sv: 'Bålzon' },
    'land.tableMixed':        { en: 'Mixed', sv: 'Blandad' },
    'land.bandExcellent':     { en: 'Excellent 🟢', sv: 'Utmärkt 🟢' },
    'land.bandImproving':     { en: 'Improving 🟡', sv: 'Förbättras 🟡' },
    'land.bandAttention':     { en: 'Needs Attention 🔴', sv: 'Kräver uppmärksamhet 🔴' },
    'land.combinedExcellent': { en: 'Excellent', sv: 'Utmärkt' },
    'land.combinedImproving': { en: 'Improving', sv: 'Förbättras' },
    'land.combinedAttention': { en: 'Needs attention', sv: 'Kräver uppmärksamhet' },
    'land.subtitleInitial':   { en: 'Quick read: solid session quality with clear room to improve.', sv: 'Snabböverblick: solid sessionskvalitet med tydligt utrymme för förbättring.' },
    'land.subtitleLow':       { en: 'Quick read: low ergonomic risk with stable posture control.', sv: 'Snabböverblick: låg ergonomisk risk med stabil hållningskontroll.' },
    'land.subtitleModerate':  { en: 'Quick read: moderate ergonomic load. Keep improving consistency.', sv: 'Snabböverblick: måttlig ergonomisk belastning. Fortsätt förbättra konsekvensen.' },
    'land.subtitleHigh':      { en: 'Quick read: high ergonomic risk. Correct posture earlier in the cycle.', sv: 'Snabböverblick: hög ergonomisk risk. Korrigera hållningen tidigare i cykeln.' }
};

let wergonicLang = 'en';

function wergonicDetectLang() {
    try {
        const stored = localStorage.getItem('wergonic-lang');
        if (WERGONIC_LANGS.includes(stored)) return stored;
    } catch (e) {}
    const browserLang = (navigator.language || '').toLowerCase();
    if (browserLang.startsWith('zh')) return 'zh';
    if (browserLang.startsWith('sv')) return 'sv';
    return 'en';
}

// Returns the translated string for `key` in the current language, falling
// back to English then to the key itself if a translation is missing.
function wergonicT(key) {
    const entry = WERGONIC_I18N_STRINGS[key];
    if (!entry) return key;
    return entry[wergonicLang] || entry.en || key;
}

function wergonicApplyI18n(scope) {
    const root = scope || document;
    root.querySelectorAll('[data-i18n]').forEach(el => {
        el.textContent = wergonicT(el.getAttribute('data-i18n'));
    });
    root.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        el.placeholder = wergonicT(el.getAttribute('data-i18n-placeholder'));
    });
    root.querySelectorAll('[data-i18n-title]').forEach(el => {
        el.title = wergonicT(el.getAttribute('data-i18n-title'));
    });
    root.querySelectorAll('.i18n-toggle').forEach(el => {
        el.textContent = wergonicT('common.langToggle');
    });
    document.documentElement.lang = { en: 'en', zh: 'zh-CN', sv: 'sv-SE' }[wergonicLang];
}

function wergonicSetLang(lang) {
    wergonicLang = WERGONIC_LANGS.includes(lang) ? lang : 'en';
    try { localStorage.setItem('wergonic-lang', wergonicLang); } catch (e) {}
    wergonicApplyI18n();
    document.dispatchEvent(new CustomEvent('wergonic-lang-changed', { detail: wergonicLang }));
}

function wergonicNextLang() {
    const idx = WERGONIC_LANGS.indexOf(wergonicLang);
    return WERGONIC_LANGS[(idx + 1) % WERGONIC_LANGS.length];
}

function wergonicInitI18n() {
    wergonicLang = wergonicDetectLang();
    wergonicApplyI18n();
    document.querySelectorAll('.i18n-toggle').forEach(btn => {
        btn.addEventListener('click', () => wergonicSetLang(wergonicNextLang()));
    });
}

// Keep language in sync across same-origin tabs (mirrors the theme toggle
// behaviour in app-shell.js — the tab that writes localStorage never gets
// its own 'storage' event, so this only fires in *other* open tabs).
window.addEventListener('storage', event => {
    if (event.key !== 'wergonic-lang') return;
    wergonicLang = WERGONIC_LANGS.includes(event.newValue) ? event.newValue : 'en';
    wergonicApplyI18n();
});

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wergonicInitI18n);
} else {
    wergonicInitI18n();
}
