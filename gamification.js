// ============================================================
// Gamification System v1.0
// Posture training gamification layer for Wergonic Device Manager
//
// Dependencies:
//   - mission-cards-data.js  (MISSION_CARDS, evaluateTriggerRule)
//   - Chart.js 4.x           (loaded via CDN in index.html)
//   - IndexedDB              (browser built-in)
//   - localStorage           (browser built-in)
// ============================================================

// ═══════════════════════════════════════════════════════════
// SECTION 1: Constants & Risk Scoring
// ═══════════════════════════════════════════════════════════

const GAM = {
    DB_NAME: 'wergonic_gamification',
    DB_VERSION: 1,
    // When served by the Express server (port 3000) use a relative path.
    // When using a dev HTTP server (e.g. "python -m http.server 8000") point
    // directly to the Express backend so API calls reach the right server.
    API_BASE: (() => {
        const p = (typeof window !== 'undefined') ? window.location.port : '3000';
        // If on port 3000 or default port, use relative path (preserves protocol)
        if (p === '3000' || p === '') return '/api';
        // Otherwise, use absolute URL with correct protocol
        const protocol = (typeof window !== 'undefined') ? window.location.protocol : 'https:';
        return `${protocol}//localhost:3000/api`;
    })(),

    RISK_LEVELS: {
        low:       { min: 1.0, max: 1.75, label: 'Low Risk',       color: '#2e7d32', bg: '#e8f5e9' },
        moderate:  { min: 1.75,max: 2.5,  label: 'Moderate Risk',  color: '#f57f17', bg: '#fff9c4' },
        high:      { min: 2.5, max: 3.25, label: 'High Risk',      color: '#e65100', bg: '#fff3e0' },
        very_high: { min: 3.25,max: 4.0,  label: 'Very High Risk', color: '#b71c1c', bg: '#ffebee' }
    }
};

/**
 * Map a single angle measurement to a RULA score (1–4) per the standard table.
 * Neck / Trunk:  1 = (-10, 10], 2 = (10, 20], 3 = (20, 60], 4 = >60 or ≤-10
 * Upper Arms:    1 = ≤20,       2 = (20, 45], 3 = (45, 90], 4 = >90
 */
function angleToRulaScore(angle, deviceType) {
    const type = (deviceType || '').toLowerCase();
    if (type.includes('arm')) {
        if (angle <= 20)  return 1;
        if (angle <= 45)  return 2;
        if (angle <= 90)  return 3;
        return 4;
    }
    // Neck / Trunk (default)
    if (angle > -10 && angle <= 10) return 1;
    if (angle > 10  && angle <= 20) return 2;
    if (angle > 20  && angle <= 60) return 3;
    return 4;
}

/**
 * Compute a session RULA score (1.00–4.00) as the mean of per-point
 * RULA values derived from the angle-threshold table.
 */
function computeRulaScore(data, deviceType) {
    if (!data || data.length === 0) return 4;
    const sum = data.reduce((s, pt) => s + angleToRulaScore(pt.angle, deviceType), 0);
    return Math.round((sum / data.length) * 100) / 100;
}

function riskLevelFromScore(score) {
    if (score <= 1.75) return 'low';
    if (score <= 2.5)  return 'moderate';
    if (score <= 3.25) return 'high';
    return 'very_high';
}

// ═══════════════════════════════════════════════════════════
// SECTION 2: SessionSummary Builder
// ═══════════════════════════════════════════════════════════

/**
 * Build a SessionSummary from parsed CSV data + calculateStatistics() output.
 * @param {Array}  data     - parsed data points from app.js
 * @param {Object} metadata - metadata from device
 * @param {Object} stats    - output of calculateStatistics()
 * @param {string} filename
 * @returns {Object} SessionSummary
 */
function buildSessionSummary(data, metadata, stats, filename) {
    const userId = getUserId();
    const now = new Date().toISOString();

    const greenPct  = parseFloat(stats.greenPercentage)  || 0;
    const yellowPct = parseFloat(stats.yellowPercentage) || 0;
    const redPct    = parseFloat(stats.redPercentage)    || 0;
    const avgRecovTime = stats.fastestRecovery !== 'N/A' ? parseFloat(stats.fastestRecovery) : null;
    const sessionDuration = stats.totalTime || 0;
    const vibCount = countVibrations(data);

    const rulaScore = computeRulaScore(data, metadata && metadata.device_type);

    const segments = computeSegments(data, metadata);

    return {
        id: generateUUID(),
        userId,
        timestamp: now,
        filename: filename || 'unknown',
        deviceType: (metadata && metadata.device_type) || 'unknown',
        subject: (metadata && metadata.subject) || '',
        sessionDuration,
        avgDeviation: parseFloat(stats.averageAngle) || 0,
        maxDeviation: data && data.length > 0 ? Math.max(...data.map(d => d.angle)) : 0,
        timeAboveThreshold: (stats.totalYellowTime || 0) + (stats.totalRedTime || 0),
        vibrationCount: vibCount,
        avgRecoveryTime: avgRecovTime,
        fastestRecovery: avgRecovTime,
        greenPct,
        yellowPct,
        redPct,
        rulaScore,
        riskLevel: riskLevelFromScore(rulaScore),
        yellowThreshold: parseFloat((metadata && metadata.threshold_yellow)) || 30,
        redThreshold: parseFloat((metadata && metadata.threshold_red)) || 60,
        longestGreenStreak: parseFloat(stats.longestGreenStreak) || 0,
        recoveryCount: stats.recoveryCount || 0,
        improvement: stats.improvement || false,
        segments
    };
}

function countVibrations(data) {
    if (!data || data.length === 0) return 0;
    let count = 0;
    let prevFeedback = 0;
    for (const pt of data) {
        if (pt.feedback > 0 && prevFeedback === 0) count++;
        prevFeedback = pt.feedback;
    }
    return count;
}

function computeSegments(data, metadata) {
    if (!data || data.length < 6) return null;

    const n = data.length;
    const t1 = Math.floor(n / 3);
    const t2 = Math.floor(2 * n / 3);

    const firstThird  = data.slice(0, t1);
    const middleThird = data.slice(t1, t2);
    const lastThird   = data.slice(t2);

    function segStats(seg, meta) {
        if (!seg || seg.length === 0) return { avgAngle: 0, maxAngle: 0, vibrations: 0, greenPct: 0, startMs: 0 };
        const angles = seg.map(d => d.angle);
        const avgAngle  = angles.reduce((a,b) => a+b, 0) / angles.length;
        const maxAngle  = Math.max(...angles);
        const vibrations = countVibrations(seg);
        const greenCount = seg.filter(d => d.zone === 'green').length;
        const greenPct  = (greenCount / seg.length) * 100;
        return {
            avgAngle:   parseFloat(avgAngle.toFixed(2)),
            maxAngle:   parseFloat(maxAngle.toFixed(2)),
            vibrations,
            greenPct: parseFloat(greenPct.toFixed(1)),
            startMs: seg[0].adjusted_elapsed_ms
        };
    }

    // Find best and worst 60-second windows
    const windowMs = 60000;
    let best60  = null;
    let worst60 = null;
    let bestAvg = Infinity;
    let worstAvg = -Infinity;

    for (let i = 0; i < data.length; i++) {
        const startMs = data[i].adjusted_elapsed_ms;
        const endMs   = startMs + windowMs;
        const window  = data.filter(d => d.adjusted_elapsed_ms >= startMs && d.adjusted_elapsed_ms < endMs);
        if (window.length < 10) continue;
        const avg = window.reduce((s, d) => s + d.angle, 0) / window.length;
        if (avg < bestAvg)  { bestAvg  = avg;  best60  = { startMs, avgAngle: parseFloat(avg.toFixed(2)) }; }
        if (avg > worstAvg) { worstAvg = avg; worst60 = { startMs, avgAngle: parseFloat(avg.toFixed(2)) }; }
    }

    return {
        first_third:   segStats(firstThird, metadata),
        middle_third:  segStats(middleThird, metadata),
        last_third:    segStats(lastThird, metadata),
        best_60s:  best60,
        worst_60s: worst60
    };
}

// ═══════════════════════════════════════════════════════════
// SECTION 3: GamificationDB (IndexedDB wrapper)
// ═══════════════════════════════════════════════════════════

const GamificationDB = {
    _db: null,

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(GAM.DB_NAME, GAM.DB_VERSION);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Sessions store
                if (!db.objectStoreNames.contains('sessions')) {
                    const store = db.createObjectStore('sessions', { keyPath: 'id' });
                    store.createIndex('by_user',      'userId',    { unique: false });
                    store.createIndex('by_timestamp', 'timestamp', { unique: false });
                }

                // Users store
                if (!db.objectStoreNames.contains('users')) {
                    db.createObjectStore('users', { keyPath: 'userId' });
                }
            };

            request.onsuccess = (event) => {
                this._db = event.target.result;
                resolve(this._db);
            };

            request.onerror = () => reject(request.error);
        });
    },

    async saveSession(summary) {
        const db = this._db;
        return new Promise((resolve, reject) => {
            const tx  = db.transaction('sessions', 'readwrite');
            const req = tx.objectStore('sessions').put(summary);
            req.onsuccess = () => resolve(summary.id);
            req.onerror   = () => reject(req.error);
        });
    },

    async getUserSessions(userId, limit = 50) {
        const db = this._db;
        return new Promise((resolve, reject) => {
            const tx    = db.transaction('sessions', 'readonly');
            const index = tx.objectStore('sessions').index('by_user');
            const req   = index.getAll(IDBKeyRange.only(userId));
            req.onsuccess = () => {
                const all = req.result || [];
                all.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                resolve(all.slice(0, limit));
            };
            req.onerror = () => reject(req.error);
        });
    },

    async setUser(userId, displayName) {
        const db = this._db;
        return new Promise((resolve, reject) => {
            const tx  = db.transaction('users', 'readwrite');
            const req = tx.objectStore('users').put({ userId, displayName, updatedAt: new Date().toISOString() });
            req.onsuccess = () => resolve();
            req.onerror   = () => reject(req.error);
        });
    },

    async getUser(userId) {
        const db = this._db;
        return new Promise((resolve, reject) => {
            const tx  = db.transaction('users', 'readonly');
            const req = tx.objectStore('users').get(userId);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror   = () => reject(req.error);
        });
    },

    async deleteSession(id) {
        const db = this._db;
        return new Promise((resolve, reject) => {
            const tx  = db.transaction('sessions', 'readwrite');
            const req = tx.objectStore('sessions').delete(id);
            req.onsuccess = () => resolve();
            req.onerror   = () => reject(req.error);
        });
    }
};

// ═══════════════════════════════════════════════════════════
// SECTION 4: TrendCalculator
// ═══════════════════════════════════════════════════════════

const TrendCalculator = {
    /**
     * Compute trend metrics from sorted sessions array (newest first).
     */
    computeTrends(sessions) {
        if (!sessions || sessions.length === 0) return null;

        const now = new Date();
        const startOfWeek = new Date(now);
        const dayOfWeek = now.getDay(); // 0=Sun
        startOfWeek.setDate(now.getDate() - dayOfWeek);
        startOfWeek.setHours(0, 0, 0, 0);

        const startOfLastWeek = new Date(startOfWeek);
        startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);

        const thisWeekSessions = sessions.filter(s => new Date(s.timestamp) >= startOfWeek);
        const lastWeekSessions = sessions.filter(s => {
            const d = new Date(s.timestamp);
            return d >= startOfLastWeek && d < startOfWeek;
        });
        const recent5 = sessions.slice(0, 5);

        const avg = (arr, key) => arr.length > 0
            ? arr.reduce((s, x) => s + (x[key] || 0), 0) / arr.length
            : null;

        const personalBest  = [...sessions].sort((a, b) => a.rulaScore - b.rulaScore)[0] || null;
        const lastSession   = sessions.length > 1 ? sessions[1] : null; // sessions[0] is current
        const currentSession = sessions[0];

        // Trend: compare rulaScore of most recent 5 vs sessions 6-10
        const older = sessions.slice(5, 10);
        let trend = 'stable';
        if (recent5.length >= 3 && older.length >= 2) {
            const r5avg   = avg(recent5, 'rulaScore');
            const oldAvg  = avg(older,   'rulaScore');
            const diff    = r5avg - oldAvg;
            if (diff < -0.3) trend = 'improving';
            else if (diff > 0.3) trend = 'declining';
        }

        // Stability index: std dev of last 5 RULA scores
        let stabilityIndex = null;
        if (recent5.length >= 3) {
            const m = avg(recent5, 'rulaScore');
            const variance = recent5.reduce((s, x) => s + Math.pow(x.rulaScore - m, 2), 0) / recent5.length;
            stabilityIndex = parseFloat(Math.sqrt(variance).toFixed(1));
        }

        // Longest consecutive improving streak
        let streak = 0;
        let maxStreak = 0;
        for (let i = 0; i < sessions.length - 1; i++) {
            if (sessions[i].rulaScore < sessions[i + 1].rulaScore) {
                streak++;
                maxStreak = Math.max(maxStreak, streak);
            } else {
                streak = 0;
            }
        }

        return {
            currentSession,
            lastSession,
            recent5Avg:  parseFloat((avg(recent5, 'rulaScore') || 0).toFixed(1)),
            thisWeekAvg: parseFloat((avg(thisWeekSessions, 'rulaScore') || 0).toFixed(1)),
            lastWeekAvg: parseFloat((avg(lastWeekSessions, 'rulaScore') || 0).toFixed(1)),
            thisWeekCount:  thisWeekSessions.length,
            lastWeekCount:  lastWeekSessions.length,
            personalBest,
            longestImprovingStreak: maxStreak,
            stabilityIndex,
            trend,
            totalSessions: sessions.length
        };
    }
};

// ═══════════════════════════════════════════════════════════
// SECTION 4b: Anthropomorphic Feedback System (Feature 13)
// ═══════════════════════════════════════════════════════════

const AnthropomorphicFeedback = {
    MESSAGES: {
        trunk: {
            very_high: [
                "My back was really struggling today — I felt a lot of strain in those red zones.",
                "Ouch! My spine needed a break — too much forward bending this session.",
                "My lower back is exhausted from all that strain. Let's straighten up next time!"
            ],
            high: [
                "My back had a tough time during parts of this session.",
                "I felt extra stress on my spine today — let's try to hold it more neutral.",
                "My trunk was working harder than it should. Small adjustments make a big difference!"
            ],
            moderate: [
                "My back was doing okay, but there's room to keep it straighter.",
                "A few moments of strain here and there — I know you can do better!",
                "Getting better! My back appreciates when you hold neutral posture."
            ],
            low: [
                "My back felt great today — excellent neutral posture!",
                "Spine happy, body happy! Great trunk control this session.",
                "My back thanks you — minimal strain and great awareness throughout."
            ]
        },
        arm: {
            very_high: [
                "My arm was too far from my body for too long — that's a lot of shoulder load!",
                "Whoa, my shoulder was working overtime this session. Let's bring the arm closer.",
                "My arm and shoulder were under serious stress today. Try to keep your elbow closer to your side."
            ],
            high: [
                "My arm was reaching out quite a bit today — my shoulder felt the strain.",
                "Some shoulder fatigue coming through — keeping the arm lower will help a lot.",
                "My elbow kept drifting away from my body. Let's work on that next session!"
            ],
            moderate: [
                "My arm position was decent today, but I noticed some drift in the yellow zones.",
                "Getting better with arm control! Just a few more stretches away than ideal.",
                "My shoulder appreciates your effort — just a bit more awareness in those yellow zones."
            ],
            low: [
                "My arm stayed nice and close today — perfect shoulder position!",
                "Excellent arm control! My shoulder had a relaxed, efficient session.",
                "My arm loved this session — great low-strain positioning throughout!"
            ]
        }
    },

    /**
     * Generate feedback text from a session summary.
     * @returns {{ message: string, icon: string, partLabel: string, riskLevel: string }}
     */
    generate(summary) {
        const deviceType = (summary.deviceType || 'trunk').toLowerCase();
        const riskLevel  = summary.riskLevel || 'moderate';
        const pool       = (this.MESSAGES[deviceType] || this.MESSAGES.trunk)[riskLevel] || this.MESSAGES.trunk.moderate;
        let message      = pool[Math.floor(Math.random() * pool.length)];

        // Append trend note if enough history
        const sessions = window._gamSessions || [];
        if (sessions.length >= 3) {
            const recent    = sessions.slice(1, 4);
            const recentAvg = recent.reduce((s, r) => s + (r.rulaScore || 0), 0) / recent.length;
            if (summary.rulaScore < recentAvg - 0.3)       message += ' That\'s better than your recent average — keep it up!';
            else if (summary.rulaScore > recentAvg + 0.3)  message += ' You can do better than this — I believe in you!';
        }

        return {
            message,
            icon:      deviceType === 'arm' ? '💪' : '🧍',
            partLabel: deviceType === 'arm' ? 'Arm & Shoulder' : 'Back & Trunk',
            riskLevel
        };
    },

    /**
     * Generate a session-arc narrative based on segment progression.
     * @returns {string|null}
     */
    generateNarrative(summary) {
        const deviceType = (summary.deviceType || 'trunk').toLowerCase();
        const partLabel  = deviceType === 'arm' ? 'arm & shoulder' : 'back & trunk';
        const segs = summary.segments;
        if (!segs) return null;

        const ft = segs.first_third, mt = segs.middle_third, lt = segs.last_third;
        const trend = (lt.greenPct > ft.greenPct + 10) ? 'improving'
                    : (lt.greenPct < ft.greenPct - 10) ? 'declining'
                    : 'stable';

        let narrative;
        if (trend === 'improving') {
            narrative = `My ${partLabel} warmed up as the session progressed — I finished stronger (${lt.greenPct}% green) than I started (${ft.greenPct}% green).`;
        } else if (trend === 'declining') {
            narrative = `My ${partLabel} started well (${ft.greenPct}% green) but fatigued toward the end (${lt.greenPct}% green). Try to maintain focus in the final stretch!`;
        } else {
            narrative = `My ${partLabel} stayed at a consistent level throughout — ${ft.greenPct}% → ${mt.greenPct}% → ${lt.greenPct}% green across thirds.`;
        }

        if (segs.best_60s && segs.worst_60s) {
            const swing = (segs.worst_60s.avgAngle - segs.best_60s.avgAngle).toFixed(1);
            if (parseFloat(swing) > 15) {
                narrative += ` There was a ${swing}° swing between my best and worst moments — working on consistency will really pay off!`;
            }
        }
        return narrative;
    }
};

function renderAnthropomorphicFeedback(containerId, summary) {
    const el = document.getElementById(containerId);
    if (!el) return;
    const { message, icon, partLabel, riskLevel } = AnthropomorphicFeedback.generate(summary);
    const level = GAM.RISK_LEVELS[riskLevel] || GAM.RISK_LEVELS.moderate;
    const narrative = AnthropomorphicFeedback.generateNarrative(summary);

    el.innerHTML = `
        ${narrative ? `<p class="anthro-narrative">${escapeHtml(narrative)}</p>` : ''}
        <div class="anthro-feedback-card" style="border-left:4px solid ${level.color};background:${level.bg};">
            <div class="anthro-feedback-icon">${icon}</div>
            <div class="anthro-feedback-content">
                <div class="anthro-feedback-label">${escapeHtml(partLabel)} Says:</div>
                <div class="anthro-feedback-msg">"${escapeHtml(message)}"</div>
            </div>
        </div>
    `;

    // Append posture snapshot grid after the card
    renderAvatarGrid(containerId, summary);
}

// ─── Mini SVG figure content helpers ────────────────────────────────────────

function _getAvatarViewMode() {
    const mode = String(window._avatarViewMode || 'front').toLowerCase();
    return mode === 'side' ? 'side' : 'front';
}

function _setAvatarViewMode(mode) {
    window._avatarViewMode = mode === 'side' ? 'side' : 'front';
}

function _syncAvatarViewButtons(scope = document) {
    const activeMode = _getAvatarViewMode();
    scope.querySelectorAll('.avatar-view-btn').forEach(btn => {
        btn.classList.toggle('active', (btn.dataset.view || 'front') === activeMode);
    });
}

const MiniAvatar3D = {
    _cache: new WeakMap(),

    isSupported() {
        return typeof window !== 'undefined' && !!window.THREE;
    },

    _zoneHex(zone) {
        if (zone === 'red') return 0xe53935;
        if (zone === 'yellow') return 0xfb8c00;
        return 0x546e7a;
    },

    _buildMannequin(scene, THREE) {
        const toon = hex => new THREE.MeshToonMaterial({ color: hex });
        const M = {
            skin: toon(0xf5c5a3),
            clothing: toon(0x546e7a),
            joint: toon(0x78909c),
            pelvis: toon(0x455a64),
            eye: toon(0x2a2a3a)
        };

        const add = (geo, mat, parent, px = 0, py = 0, pz = 0, sx = 1, sy = 1, sz = 1) => {
            const m = new THREE.Mesh(geo, mat);
            m.position.set(px, py, pz);
            m.scale.set(sx, sy, sz);
            parent.add(m);
            return m;
        };

        const root = new THREE.Group();
        scene.add(root);

        add(new THREE.CylinderGeometry(0.15, 0.13, 0.22, 18), M.pelvis, root, 0, 0.11, 0);

        const spinePivot = new THREE.Group();
        spinePivot.position.set(0, 0.22, 0);
        root.add(spinePivot);

        add(new THREE.CylinderGeometry(0.185, 0.155, 0.6, 18), M.clothing, spinePivot, 0, 0.30, 0);

        const chestGroup = new THREE.Group();
        chestGroup.position.set(0, 0.62, 0);
        spinePivot.add(chestGroup);

        add(new THREE.CylinderGeometry(0.065, 0.085, 0.2, 12), M.skin, chestGroup, 0, 0.10, 0);
        add(new THREE.SphereGeometry(0.155, 22, 16), M.skin, chestGroup, 0, 0.37, 0);
        add(new THREE.SphereGeometry(0.025, 8, 6), M.eye, chestGroup, -0.054, 0.39, 0.142);
        add(new THREE.SphereGeometry(0.025, 8, 6), M.eye, chestGroup, 0.054, 0.39, 0.142);
        const earM = new THREE.MeshToonMaterial({ color: 0xedac8a });
        add(new THREE.SphereGeometry(0.032, 8, 6), earM, chestGroup, -0.15, 0.37, 0, 0.7, 1, 0.5);
        add(new THREE.SphereGeometry(0.032, 8, 6), earM, chestGroup, 0.15, 0.37, 0, 0.7, 1, 0.5);

        const buildArm = side => {
            const s = side === 'left' ? -1 : 1;
            const sg = new THREE.Group();
            sg.position.set(s * 0.37, -0.04, 0);
            chestGroup.add(sg);

            add(new THREE.SphereGeometry(0.10, 14, 10), M.joint, sg);

            const uap = new THREE.Group();
            sg.add(uap);
            if (side === 'left') root.lArmP = uap;
            else root.rArmP = uap;

            add(new THREE.CylinderGeometry(0.072, 0.060, 0.30, 14), M.skin, uap, 0, -0.15, 0);
            add(new THREE.CylinderGeometry(0.082, 0.068, 0.20, 14), M.clothing, uap, 0, -0.08, 0);
            add(new THREE.SphereGeometry(0.066, 12, 8), M.joint, uap, 0, -0.30, 0);

            const fap = new THREE.Group();
            fap.position.set(0, -0.30, 0);
            fap.rotation.x = THREE.MathUtils.degToRad(-12);
            uap.add(fap);

            add(new THREE.CylinderGeometry(0.060, 0.046, 0.28, 14), M.skin, fap, 0, -0.14, 0);
            add(new THREE.SphereGeometry(0.050, 10, 8), M.joint, fap, 0, -0.28, 0);
            add(new THREE.SphereGeometry(0.060, 12, 10), M.skin, fap, 0, -0.35, 0, 0.9, 0.8, 0.7);
        };

        buildArm('left');
        buildArm('right');

        root.spinePivot = spinePivot;
        root.M = M;
        root.setTrunkAngle = deg => {
            spinePivot.rotation.x = THREE.MathUtils.degToRad(Math.max(0, deg));
        };
        root.setArmAngle = (deg, trunkDeg = 0) => {
            const rad = -THREE.MathUtils.degToRad(Math.max(0, deg)) - THREE.MathUtils.degToRad(trunkDeg);
            root.lArmP.rotation.x = rad;
            root.rArmP.rotation.x = rad;
        };
        root.setTrunkZone = zone => {
            const c = this._zoneHex(zone);
            root.M.clothing.color.setHex(c);
            root.M.pelvis.color.setHex(zone === 'red' ? 0xb71c1c : zone === 'yellow' ? 0xe65100 : 0x455a64);
        };
        root.setArmZone = zone => {
            root.M.joint.color.setHex(zone === 'red' ? 0xef5350 : zone === 'yellow' ? 0xffa726 : 0x78909c);
        };
        root.reset = () => {
            root.spinePivot.rotation.x = 0;
            root.lArmP.rotation.x = 0;
            root.rArmP.rotation.x = 0;
            root.M.clothing.color.setHex(0x546e7a);
            root.M.pelvis.color.setHex(0x455a64);
            root.M.joint.color.setHex(0x78909c);
        };

        return root;
    },

    _create(canvas) {
        const THREE = window.THREE;
        const rect = canvas.getBoundingClientRect();
        const width = Math.max(70, Math.round(rect.width || canvas.width || 70));
        const height = Math.max(110, Math.round(rect.height || canvas.height || 113));
        canvas.width = width * Math.min(window.devicePixelRatio || 1, 2);
        canvas.height = height * Math.min(window.devicePixelRatio || 1, 2);

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(38, width / height, 0.05, 30);
        camera.position.set(0.45, 1.15, 2.8);
        camera.lookAt(0, 0.72, 0);

        const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(width, height, false);
        renderer.setClearColor(0x000000, 0);

        scene.add(new THREE.AmbientLight(0xffffff, 0.68));
        const sun = new THREE.DirectionalLight(0xfff8ee, 0.92);
        sun.position.set(2, 4, 3);
        scene.add(sun);
        const fill = new THREE.DirectionalLight(0x94a8c6, 0.34);
        fill.position.set(-2, 2, -1);
        scene.add(fill);

        const mannequin = this._buildMannequin(scene, THREE);
        const ctx = { scene, camera, renderer, mannequin };
        this._cache.set(canvas, ctx);
        return ctx;
    },

    render(canvas, { deviceType, angle, zone }) {
        if (!this.isSupported() || !canvas) return false;
        const ctx = this._cache.get(canvas) || this._create(canvas);
        const kind = (deviceType || 'trunk').toLowerCase();
        const rawAngle = Math.max(0, +angle || 0);
        const trunkDeg = kind === 'trunk' ? rawAngle : Math.min(18, rawAngle * 0.22);
        const armDeg = kind === 'arm' ? rawAngle : Math.max(8, rawAngle * 0.6);

        ctx.mannequin.reset();
        ctx.mannequin.setTrunkAngle(trunkDeg);
        ctx.mannequin.setArmAngle(armDeg, trunkDeg);
        ctx.mannequin.setTrunkZone(kind === 'trunk' ? zone : 'green');
        ctx.mannequin.setArmZone(kind === 'arm' ? zone : 'green');
        ctx.renderer.render(ctx.scene, ctx.camera);
        return true;
    }
};

function _renderAvatarGridMini3D(rootEl) {
    if (!MiniAvatar3D.isSupported() || !rootEl) return;
    rootEl.querySelectorAll('.avatar-mini-canvas').forEach(canvas => {
        const deviceType = canvas.dataset.deviceType || 'trunk';
        const angle = parseFloat(canvas.dataset.angle || '0');
        const zone = canvas.dataset.zone || 'green';
        MiniAvatar3D.render(canvas, { deviceType, angle, zone });
    });
}

function _composePostureViewerSvg(angleDeg, zoneColor, deviceType, compact = false, viewMode = null) {
    const mode = viewMode || _getAvatarViewMode();
    const inputDeg = Math.max(0, +angleDeg || 0);

    // Use negative visual rotation so increasing trunk angle leans forward.
    const trunkDeg = deviceType === 'trunk' ? inputDeg : Math.min(18, inputDeg * 0.22);
    const armDeg   = deviceType === 'arm' ? inputDeg : Math.max(8, inputDeg * 0.6);

    const trunkRad   = -(trunkDeg * Math.PI) / 180;
    const armRad     = (armDeg * Math.PI) / 180;
    const forearmRad = armRad * 0.72 + trunkRad * 0.12;

    const hipX = 70, hipY = 142;
    const torsoLen = 64;
    const shoulderHalf = 17;
    const upperLen = 46;
    const lowerLen = 40;

    // Front view keeps forward flexion as vertical shortening;
    // side view exposes sagittal displacement.
    const sagittalXScale = mode === 'side' ? 1 : 0.08;
    const armXScale = mode === 'side' ? 1 : 0.2;
    const shoulderDepthScale = mode === 'side' ? 0.4 : 1;

    const torsoUx = Math.sin(trunkRad) * sagittalXScale;
    const torsoUy = -Math.cos(trunkRad);
    const torsoNx = Math.cos(trunkRad) * shoulderDepthScale;
    const torsoNy = Math.sin(trunkRad) * shoulderDepthScale * sagittalXScale;

    const shoulderCx = hipX + torsoUx * torsoLen;
    const shoulderCy = hipY + torsoUy * torsoLen;

    const leftShoulder = {
        x: shoulderCx - torsoNx * shoulderHalf,
        y: shoulderCy - torsoNy * shoulderHalf
    };
    const rightShoulder = {
        x: shoulderCx + torsoNx * shoulderHalf,
        y: shoulderCy + torsoNy * shoulderHalf
    };

    const neckBase = {
        x: shoulderCx + torsoUx * 8,
        y: shoulderCy + torsoUy * 8
    };
    const headC = {
        x: neckBase.x + torsoUx * 16,
        y: neckBase.y + torsoUy * 16
    };

    const elbow = {
        x: rightShoulder.x + Math.sin(armRad) * upperLen * armXScale,
        y: rightShoulder.y + Math.cos(armRad) * upperLen
    };
    const wrist = {
        x: elbow.x + Math.sin(forearmRad) * lowerLen * armXScale,
        y: elbow.y + Math.cos(forearmRad) * lowerLen
    };

    const leftArmDownRad = trunkRad - 0.16;
    const leftElbow = {
        x: leftShoulder.x + Math.sin(leftArmDownRad) * 38 * armXScale,
        y: leftShoulder.y + Math.cos(leftArmDownRad) * 38
    };
    const leftWrist = {
        x: leftElbow.x + Math.sin(leftArmDownRad + 0.04) * 34 * armXScale,
        y: leftElbow.y + Math.cos(leftArmDownRad + 0.04) * 34
    };

    const leftHip = { x: hipX - 15, y: hipY + 2 };
    const rightHip = { x: hipX + 15, y: hipY + 2 };
    const leftKnee = { x: leftHip.x - 3, y: leftHip.y + 52 };
    const rightKnee = { x: rightHip.x + 3, y: rightHip.y + 52 };
    const leftAnkle = { x: leftKnee.x - 2, y: leftKnee.y + 34 };
    const rightAnkle = { x: rightKnee.x + 2, y: rightKnee.y + 34 };

    const tone = compact ? '#b6bcc3' : '#a8b1b8';
    const skin = '#f5c5a3';
    const torsoW = compact ? 10 : 11;
    const armW = compact ? 6 : 7;
    const forearmW = compact ? 5 : 6;

    return `
        <line x1="${hipX}" y1="${hipY}" x2="${shoulderCx.toFixed(1)}" y2="${shoulderCy.toFixed(1)}" stroke="${zoneColor}" stroke-width="${torsoW}" stroke-linecap="round"/>
        <line x1="${leftShoulder.x.toFixed(1)}" y1="${leftShoulder.y.toFixed(1)}" x2="${rightShoulder.x.toFixed(1)}" y2="${rightShoulder.y.toFixed(1)}" stroke="${zoneColor}" stroke-width="5" stroke-linecap="round"/>

        <line x1="${leftShoulder.x.toFixed(1)}" y1="${leftShoulder.y.toFixed(1)}" x2="${leftElbow.x.toFixed(1)}" y2="${leftElbow.y.toFixed(1)}" stroke="${tone}" stroke-width="${armW}" stroke-linecap="round"/>
        <line x1="${leftElbow.x.toFixed(1)}" y1="${leftElbow.y.toFixed(1)}" x2="${leftWrist.x.toFixed(1)}" y2="${leftWrist.y.toFixed(1)}" stroke="${tone}" stroke-width="${forearmW}" stroke-linecap="round"/>

        <line x1="${rightShoulder.x.toFixed(1)}" y1="${rightShoulder.y.toFixed(1)}" x2="${elbow.x.toFixed(1)}" y2="${elbow.y.toFixed(1)}" stroke="${zoneColor}" stroke-width="${armW}" stroke-linecap="round"/>
        <line x1="${elbow.x.toFixed(1)}" y1="${elbow.y.toFixed(1)}" x2="${wrist.x.toFixed(1)}" y2="${wrist.y.toFixed(1)}" stroke="${zoneColor}" stroke-width="${forearmW}" stroke-linecap="round"/>

        <line x1="${leftHip.x}" y1="${leftHip.y}" x2="${leftKnee.x}" y2="${leftKnee.y}" stroke="${tone}" stroke-width="5" stroke-linecap="round"/>
        <line x1="${leftKnee.x}" y1="${leftKnee.y}" x2="${leftAnkle.x}" y2="${leftAnkle.y}" stroke="${tone}" stroke-width="4" stroke-linecap="round"/>
        <line x1="${rightHip.x}" y1="${rightHip.y}" x2="${rightKnee.x}" y2="${rightKnee.y}" stroke="${tone}" stroke-width="5" stroke-linecap="round"/>
        <line x1="${rightKnee.x}" y1="${rightKnee.y}" x2="${rightAnkle.x}" y2="${rightAnkle.y}" stroke="${tone}" stroke-width="4" stroke-linecap="round"/>

        <line x1="${neckBase.x.toFixed(1)}" y1="${neckBase.y.toFixed(1)}" x2="${headC.x.toFixed(1)}" y2="${headC.y.toFixed(1)}" stroke="${skin}" stroke-width="6" stroke-linecap="round"/>
        <circle cx="${headC.x.toFixed(1)}" cy="${headC.y.toFixed(1)}" r="13" fill="${skin}" stroke="#9e9e9e" stroke-width="1.4"/>
        <circle cx="${(headC.x - 4).toFixed(1)}" cy="${(headC.y - 1).toFixed(1)}" r="1.5" fill="#2a2a3a"/>
        <circle cx="${(headC.x + 4).toFixed(1)}" cy="${(headC.y - 1).toFixed(1)}" r="1.5" fill="#2a2a3a"/>

        <circle cx="${hipX}" cy="${hipY}" r="4.8" fill="${zoneColor}"/>
        <circle cx="${rightShoulder.x.toFixed(1)}" cy="${rightShoulder.y.toFixed(1)}" r="4.4" fill="${zoneColor}"/>
        <circle cx="${elbow.x.toFixed(1)}" cy="${elbow.y.toFixed(1)}" r="3.8" fill="${zoneColor}"/>
    `;
}

function _miniArmSvgContent(angleDeg, zoneColor) {
    return _composePostureViewerSvg(angleDeg, zoneColor, 'arm', true);
}

function _miniTrunkSvgContent(angleDeg, zoneColor) {
    return _composePostureViewerSvg(angleDeg, zoneColor, 'trunk', true);
}

/**
 * Render a row of mini avatar figures — one per session segment — so the
 * user can visually compare posture across the session timeline.
 * "Jump →" buttons seek the Avatar Replay
 * modal to the matching timestamp.
 */
function renderAvatarGrid(containerId, summary) {
    const el = document.getElementById(containerId);
    if (!el) return;

    const deviceType = (summary.deviceType || 'trunk').toLowerCase();
    const segs = summary.segments;
    if (!segs) return;

    const yThr = summary.yellowThreshold || 30;
    const rThr = summary.redThreshold   || 60;
    const zoneOf = a => a >= rThr ? 'red' : (a >= yThr ? 'yellow' : 'green');
    const zoneCol = z => z === 'red' ? '#f44336' : (z === 'yellow' ? '#ffc107' : '#4caf50');
    const svgFn   = deviceType === 'arm' ? _miniArmSvgContent : _miniTrunkSvgContent;

    // Build avatar list: thirds + best/worst 60s
    const avatars = [
        { label: 'Start',   badge: null, avgAngle: segs.first_third.avgAngle,  zone: zoneOf(segs.first_third.avgAngle),  timeMs: segs.first_third.startMs },
        { label: 'Mid',     badge: null, avgAngle: segs.middle_third.avgAngle, zone: zoneOf(segs.middle_third.avgAngle), timeMs: segs.middle_third.startMs },
        { label: 'End',     badge: null, avgAngle: segs.last_third.avgAngle,   zone: zoneOf(segs.last_third.avgAngle),   timeMs: segs.last_third.startMs },
    ];
    if (segs.best_60s)  avatars.push({ label: 'Best 60s',  badge: '🏆', avgAngle: segs.best_60s.avgAngle,  zone: 'green', timeMs: segs.best_60s.startMs });
    if (segs.worst_60s) avatars.push({ label: 'Worst 60s', badge: '⚠️', avgAngle: segs.worst_60s.avgAngle, zone: 'red',   timeMs: segs.worst_60s.startMs });

    const cards = avatars.map(av => {
        const color = zoneCol(av.zone);
        const svgInner = svgFn(av.avgAngle, color);
        const figure = MiniAvatar3D.isSupported()
            ? `<canvas class="avatar-mini-canvas" width="70" height="113" data-device-type="${deviceType}" data-angle="${av.avgAngle}" data-zone="${av.zone}"></canvas>`
            : `<svg viewBox="0 0 140 225" width="70" height="113" xmlns="http://www.w3.org/2000/svg">${svgInner}</svg>`;
        const angleLabel = av.avgAngle === 0 ? 'Neutral' : `${av.avgAngle}°`;
        const action = av.timeMs != null
            ? `<button class="avatar-jump-btn" onclick="openAvatarReplayAtMs(${av.timeMs})">▶ Replay</button>`
            : `<span class="avatar-reference-tag">reference</span>`;
        return `
            <div class="avatar-grid-card">
                <div class="avatar-grid-label">${av.badge ? av.badge + ' ' : ''}${av.label}</div>
                ${figure}
                <div class="avatar-grid-angle" style="color:${color}">${angleLabel}</div>
                ${action}
            </div>`;
    }).join('');

    el.insertAdjacentHTML('beforeend', `
        <div class="avatar-grid-section">
            <div class="avatar-grid-title">Posture Snapshots</div>
            <div class="avatar-grid-row">${cards}</div>
            <p class="avatar-grid-hint">Click ▶ Replay to jump the full animation to that moment.</p>
        </div>
    `);

    _renderAvatarGridMini3D(el);
}

/** Open the Avatar Replay modal and seek to a specific session timestamp (ms). */
function openAvatarReplayAtMs(ms) {
    const data       = window._gamCurrentData;
    const deviceType = window._gamCurrentDeviceType;
    if (!data || data.length === 0) return;
    showAvatarReplayModal(data, deviceType);
    // Give the modal one frame to initialise before seeking
    requestAnimationFrame(() => AvatarReplay.seekToMs(ms));
}

// ═══════════════════════════════════════════════════════════
// SECTION 5: GroupAPI
// ═══════════════════════════════════════════════════════════

const GroupAPI = {
    _serverAvailable: null,

    // Central fetch helper – always sends cookies so Express sessions work
    // cross-origin (e.g. Python dev server on :8000 → Express on :3000).
    async _fetch(url, opts = {}) {
        return fetch(url, { credentials: 'include', ...opts });
    },

    async checkServerAvailable() {
        if (this._serverAvailable !== null) return this._serverAvailable;
        try {
            const res = await this._fetch(`${GAM.API_BASE}/auth-status`);
            // 200 = server up (may or may not be authenticated – both are fine)
            // 401 = server up but not authenticated
            this._serverAvailable = res.ok || res.status === 401;
        } catch {
            this._serverAvailable = false;
        }
        return this._serverAvailable;
    },

    async createGroup(name) {
        const userId = getUserId();
        const displayName = getDisplayName();
        const res = await this._fetch(`${GAM.API_BASE}/groups`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, userId, displayName })
        });
        if (!res.ok) throw new Error(await res.text());
        return res.json();
    },

    async listGroups() {
        const res = await this._fetch(`${GAM.API_BASE}/groups`);
        if (!res.ok) throw new Error('Failed to list groups');
        return res.json();
    },

    async getGroup(groupId) {
        const res = await this._fetch(`${GAM.API_BASE}/groups/${encodeURIComponent(groupId)}`);
        if (!res.ok) throw new Error('Group not found');
        return res.json();
    },

    async joinGroup(groupId) {
        const userId = getUserId();
        const displayName = getDisplayName();
        const res = await this._fetch(`${GAM.API_BASE}/groups/${encodeURIComponent(groupId)}/join`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, displayName })
        });
        if (!res.ok) throw new Error(await res.text());
        return res.json();
    },

    async leaveGroup(groupId) {
        const userId = getUserId();
        const res = await this._fetch(`${GAM.API_BASE}/groups/${encodeURIComponent(groupId)}/leave`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId })
        });
        if (!res.ok) throw new Error(await res.text());
        return res.ok;
    },

    async uploadSession(summary, groupId) {
        const res = await this._fetch(`${GAM.API_BASE}/sessions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...summary, groupId })
        });
        if (!res.ok) throw new Error(await res.text());
        return res.json();
    },

    async getGroupSessions(groupId) {
        const res = await this._fetch(`${GAM.API_BASE}/sessions?groupId=${encodeURIComponent(groupId)}`);
        if (!res.ok) throw new Error('Failed to get group sessions');
        return res.json();
    },

    async getGroupStats(groupId) {
        const res = await this._fetch(`${GAM.API_BASE}/groups/${encodeURIComponent(groupId)}/stats`);
        if (!res.ok) throw new Error('Failed to get group stats');
        return res.json();
    },

    // ── Goals API ──────────────────────────────────────────
    async setGroupGoal(groupId, type, target, description) {
        const res = await this._fetch(`${GAM.API_BASE}/groups/${encodeURIComponent(groupId)}/goals`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type, target, description })
        });
        if (!res.ok) throw new Error(await res.text());
        return res.json();
    },

    async getGroupGoals(groupId) {
        const res = await this._fetch(`${GAM.API_BASE}/groups/${encodeURIComponent(groupId)}/goals`);
        if (!res.ok) throw new Error('Failed to get group goals');
        return res.json();
    },

    // ── Season & Leaderboard API ───────────────────────────
    async getCurrentSeason() {
        const res = await this._fetch(`${GAM.API_BASE}/seasons/current`);
        if (!res.ok) throw new Error('Failed to get season');
        return res.json();
    },

    async getLeaderboard() {
        const res = await this._fetch(`${GAM.API_BASE}/leaderboard`);
        if (!res.ok) throw new Error('Failed to get leaderboard');
        return res.json();
    }
};

// ═══════════════════════════════════════════════════════════
// SECTION 6: Mission Card Engine
// ═══════════════════════════════════════════════════════════

const MissionCardEngine = {
    /**
     * Select the best card for today given user history.
     */
    selectCard(lastSession) {
        const cards = window.MISSION_CARDS || [];
        if (cards.length === 0) return null;

        const context = {
            lastSession,
            noHistory: !lastSession
        };

        // Filter to eligible cards
        const eligible = cards.filter(c =>
            window.evaluateTriggerRule ? window.evaluateTriggerRule(c.triggerRule, context) : true
        );
        if (eligible.length === 0) return cards[Math.floor(Math.random() * cards.length)];

        // Prefer cards matching the user's most urgent need
        const prioritized = [];

        if (lastSession) {
            if (lastSession.redPct > 20 && lastSession.deviceType === 'trunk') {
                const trunkCards = eligible.filter(c => c.tags.includes('trunk'));
                if (trunkCards.length > 0) prioritized.push(...trunkCards);
            }
            if (lastSession.redPct > 20 && lastSession.deviceType === 'arm') {
                const armCards = eligible.filter(c => c.tags.includes('arm'));
                if (armCards.length > 0) prioritized.push(...armCards);
            }
            if (lastSession.avgRecoveryTime && lastSession.avgRecoveryTime > 10) {
                const recCards = eligible.filter(c => c.id === 'general-009');
                if (recCards.length > 0) prioritized.push(...recCards);
            }
        }

        const pool = prioritized.length > 0 ? prioritized : eligible;

        // Avoid showing same card two days in a row
        const lastId = localStorage.getItem('wergonic_last_card_id');
        const filtered = pool.length > 1 ? pool.filter(c => c.id !== lastId) : pool;

        return filtered[Math.floor(Math.random() * filtered.length)];
    },

    /**
     * Get today's card (uses localStorage to not repeat within same day).
     */
    getTodayCard(lastSession) {
        const today = new Date().toDateString();
        const storedDate = localStorage.getItem('wergonic_mission_card_date');
        const storedId   = localStorage.getItem('wergonic_mission_card_id');

        if (storedDate === today && storedId) {
            const cards = window.MISSION_CARDS || [];
            const found = cards.find(c => c.id === storedId);
            if (found) return found;
        }

        // Pick a new card
        const card = this.selectCard(lastSession);
        if (card) {
            localStorage.setItem('wergonic_mission_card_date', today);
            localStorage.setItem('wergonic_mission_card_id', card.id);
            localStorage.setItem('wergonic_last_card_id', card.id);
        }
        return card;
    }
};

// ═══════════════════════════════════════════════════════════
// SECTION 7: User Identity Helpers
// ═══════════════════════════════════════════════════════════

function generateUUID() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

function getUserId() {
    let id = localStorage.getItem('wergonic_userId');
    if (!id) {
        id = generateUUID();
        localStorage.setItem('wergonic_userId', id);
    }
    return id;
}

function getDisplayName() {
    return localStorage.getItem('wergonic_displayName') || 'Unnamed User';
}

function setDisplayName(name) {
    localStorage.setItem('wergonic_displayName', name.trim() || 'Unnamed User');
}

function getAvatarInitials(name) {
    return (name || '?').trim().charAt(0).toUpperCase();
}

// ═══════════════════════════════════════════════════════════
// UI SECTION 8: User Identity Bar
// ═══════════════════════════════════════════════════════════

function renderUserIdentityBar() {
    const bar = document.getElementById('userIdentityBar');
    if (!bar) return;

    const name = getDisplayName();
    const isDefault = name === 'Unnamed User';

    if (isDefault) {
        bar.innerHTML = `
            <div class="user-setup-prompt" style="width:100%;">
                <span style="font-size:0.9rem;color:var(--md-sys-color-on-surface-variant);">👋 Enter your name:</span>
                <input type="text" id="userNameSetupInput" placeholder="Your name" maxlength="30">
                <button class="btn btn-small btn-primary" id="userNameSaveBtn">Save</button>
                <button id="missionCardReopenBtn" class="mission-card-reopen-btn" title="Today's Mission">🎯</button>
            </div>
        `;
        document.getElementById('userNameSaveBtn').addEventListener('click', () => {
            const val = document.getElementById('userNameSetupInput').value.trim();
            if (val) {
                setDisplayName(val);
                GamificationDB.setUser(getUserId(), val).catch(() => {});
                renderUserIdentityBar();
            }
        });
        document.getElementById('userNameSetupInput').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') document.getElementById('userNameSaveBtn').click();
        });
    } else {
        const sessions = window._gamSessions || [];
        const subtitle = sessions.length > 0
            ? `${sessions.length} training sessions`
            : 'No training sessions yet';

        bar.innerHTML = `
            <div id="userIdentityBar" style="display:flex;align-items:center;gap:10px;padding:10px 16px;background:var(--md-sys-color-primary-container);border-radius:var(--md-sys-shape-corner-medium);margin-bottom:12px;">
                <div class="user-avatar">${getAvatarInitials(name)}</div>
                <div class="user-info">
                    <div class="user-name">${escapeHtml(name)}</div>
                    <div class="user-subtitle">${subtitle}</div>
                </div>
                <button id="missionCardReopenBtn" class="mission-card-reopen-btn" title="Today's Mission">🎯 Today's Mission</button>
                <button class="user-edit-btn" id="userEditBtn" title="Edit name">✏️</button>
            </div>
        `;
        // Re-attach to the outer bar since innerHTML replacement changes the element
        const newBar = bar.querySelector('#userIdentityBar') || bar;
        newBar.querySelector && newBar.querySelector('#userEditBtn') && newBar.querySelector('#userEditBtn').addEventListener('click', () => {
            const newName = prompt('Edit name:', name);
            if (newName !== null && newName.trim()) {
                setDisplayName(newName.trim());
                GamificationDB.setUser(getUserId(), newName.trim()).catch(() => {});
                renderUserIdentityBar();
            }
        });
    }

    // Re-bind mission card reopen button
    const reopenBtn = document.getElementById('missionCardReopenBtn');
    if (reopenBtn) {
        reopenBtn.onclick = () => showMissionCardModal(true);
    }
}

// Simpler re-render that doesn't self-reference
function refreshIdentityBar() {
    const bar = document.getElementById('userIdentityBar');
    if (!bar) return;
    const name = getDisplayName();
    const isDefault = name === 'Unnamed User';
    const sessions = window._gamSessions || [];
    const subtitle  = sessions.length > 0 ? `${sessions.length} training sessions` : 'No training sessions yet';

    if (isDefault) {
        bar.innerHTML = `
            <span style="font-size:0.9rem;color:var(--md-sys-color-on-surface-variant);flex-shrink:0;">👋 Enter your name:</span>
            <input type="text" id="userNameSetupInput" placeholder="Your name" maxlength="30" style="flex:1;padding:8px 12px;border-radius:var(--md-sys-shape-corner-small);border:1.5px solid var(--md-sys-color-outline);font-size:0.9rem;">
            <button class="btn btn-small btn-primary" id="userNameSaveBtn">Save</button>
            <button id="missionCardReopenBtn" class="mission-card-reopen-btn">🎯</button>
        `;
    } else {
        bar.innerHTML = `
            <div class="user-avatar">${getAvatarInitials(name)}</div>
            <div class="user-info">
                <div class="user-name">${escapeHtml(name)}</div>
                <div class="user-subtitle">${subtitle}</div>
            </div>
            <button id="missionCardReopenBtn" class="mission-card-reopen-btn">🎯 Today's Mission</button>
            <button class="user-edit-btn" id="userEditBtn" title="Edit name">✏️</button>
        `;
    }

    document.getElementById('userNameSaveBtn') && document.getElementById('userNameSaveBtn').addEventListener('click', () => {
        const val = document.getElementById('userNameSetupInput').value.trim();
        if (val) { setDisplayName(val); GamificationDB.setUser(getUserId(), val).catch(()=>{}); refreshIdentityBar(); }
    });
    document.getElementById('userNameSetupInput') && document.getElementById('userNameSetupInput').addEventListener('keydown', e => {
        if (e.key === 'Enter') document.getElementById('userNameSaveBtn') && document.getElementById('userNameSaveBtn').click();
    });
    document.getElementById('userEditBtn') && document.getElementById('userEditBtn').addEventListener('click', () => {
        const n = prompt('Edit name:', name);
        if (n !== null && n.trim()) { setDisplayName(n.trim()); GamificationDB.setUser(getUserId(), n.trim()).catch(()=>{}); refreshIdentityBar(); }
    });
    document.getElementById('missionCardReopenBtn') && (document.getElementById('missionCardReopenBtn').onclick = () => showMissionCardModal(true));
}

// ═══════════════════════════════════════════════════════════
// UI SECTION 9: Mission Card Modal
// ═══════════════════════════════════════════════════════════

function showMissionCardModal(forceShow = false) {
    const modal = document.getElementById('missionCardModal');
    if (!modal) return;

    const today = new Date().toDateString();
    const dismissed = localStorage.getItem('wergonic_mission_dismissed_date');
    if (!forceShow && dismissed === today) return;

    // Get last session for context
    const lastSession = window._gamSessions && window._gamSessions.length > 1
        ? window._gamSessions[1]
        : null;

    const card = MissionCardEngine.getTodayCard(lastSession);
    if (!card) return;

    modal.innerHTML = `
        <div class="mission-card-container">
            <div class="mission-card-header">
                <span class="mc-badge">Today's Mission</span>
                <h3>${escapeHtml(card.title)}</h3>
                <button class="mission-card-close" id="missionCardCloseBtn">×</button>
            </div>
            <div class="mission-card-body">
                <div class="mc-row">
                    <div class="mc-row-label">Why It Matters</div>
                    <div class="mc-row-text">${escapeHtml(card.why)}</div>
                </div>
                <div class="mc-row">
                    <div class="mc-row-label">Today's Action</div>
                    <div class="mc-row-text">${escapeHtml(card.action)}</div>
                </div>
                <div class="mc-row">
                    <div class="mc-row-label">Post-Session Checkpoint</div>
                    <div class="mc-row-text">${escapeHtml(card.checkpoint)}</div>
                </div>
            </div>
            <div class="mission-card-footer">
                <button class="mc-got-it-btn" id="missionGotItBtn">Got it!</button>
            </div>
        </div>
    `;

    modal.classList.remove('hidden');

    document.getElementById('missionCardCloseBtn').addEventListener('click', () => {
        modal.classList.add('hidden');
        localStorage.setItem('wergonic_mission_dismissed_date', today);
    });
    document.getElementById('missionGotItBtn').addEventListener('click', () => {
        modal.classList.add('hidden');
        localStorage.setItem('wergonic_mission_dismissed_date', today);
    });
}

// ═══════════════════════════════════════════════════════════
// UI SECTION 10: Risk Gauge
// ═══════════════════════════════════════════════════════════

function renderRiskGauge(containerId, rulaScore, riskLevel) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const levelInfo = GAM.RISK_LEVELS[riskLevel] || GAM.RISK_LEVELS.low;

    // SVG half-circle gauge
    const radius = 60;
    const cx = 80;
    const cy = 80;
    const circumference = Math.PI * radius; // half circle
    const startAngle = Math.PI; // left (180°)
    const endAngle = 0;         // right (360°)

    // Map score 1–4 to arc fill (0–100%)
    const pct = Math.min(1, Math.max(0, (rulaScore - 1) / 3));

    // Get arc color based on 1–4 thresholds
    let gaugeColor = '#2e7d32';
    if (rulaScore > 3.25) gaugeColor = '#b71c1c';
    else if (rulaScore > 2.5) gaugeColor = '#e65100';
    else if (rulaScore > 1.75) gaugeColor = '#f57f17';

    const trackD = describeArc(cx, cy, radius, 180, 360);
    const fillD  = describeArc(cx, cy, radius, 180, 180 + pct * 180);

    const displayScore = typeof rulaScore === 'number' ? rulaScore.toFixed(1) : rulaScore;

    // Use SVG path for gauge
    container.innerHTML = `
        <div class="risk-gauge-wrapper">
            <svg class="risk-gauge-svg" width="160" height="100" viewBox="0 0 160 100">
                <path d="${trackD}" stroke="var(--md-sys-color-surface-container-high)"
                    stroke-width="14" fill="none" stroke-linecap="round"/>
                <path d="${fillD}" stroke="${gaugeColor}"
                    stroke-width="14" fill="none" stroke-linecap="round"
                    class="risk-gauge-fill" id="gaugeArcFill"
                    style="transition:stroke-dashoffset 1s cubic-bezier(0.34,1.56,0.64,1)"/>
                <text x="${cx}" y="${cy + 8}" class="risk-gauge-label" fill="${gaugeColor}">${displayScore}</text>
                <text x="${cx}" y="${cy + 22}" class="risk-gauge-sublabel" fill="var(--md-sys-color-on-surface-variant)">RULA Score (1–4)</text>
            </svg>
            <span class="risk-level-badge ${riskLevel}">
                ${levelInfo.label}
            </span>
        </div>
    `;
}

/**
 * Helper: SVG arc path description
 */
function describeArc(cx, cy, r, startDeg, endDeg) {
    const toRad = deg => (deg * Math.PI) / 180;
    const x1 = cx + r * Math.cos(toRad(startDeg));
    const y1 = cy + r * Math.sin(toRad(startDeg));
    const x2 = cx + r * Math.cos(toRad(endDeg));
    const y2 = cy + r * Math.sin(toRad(endDeg));
    const large = endDeg - startDeg > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
}

// ═══════════════════════════════════════════════════════════
// UI SECTION 11: Segment Comparison
// ═══════════════════════════════════════════════════════════

function renderSegmentComparison(containerId, segments) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!segments) {
        container.innerHTML = '<p class="gam-placeholder">Not enough data for segment analysis</p>';
        return;
    }

    const { first_third: ft, middle_third: mt, last_third: lt } = segments;

    // Determine best and worst thirds
    const thirds = [
        { key: 'first', label: 'First 1/3', ...ft },
        { key: 'middle', label: 'Middle 1/3', ...mt },
        { key: 'last',  label: 'Last 1/3',  ...lt }
    ];

    const bestGreen  = Math.max(...thirds.map(t => t.greenPct));
    const worstGreen = Math.min(...thirds.map(t => t.greenPct));

    function segCard(seg, label) {
        const isBest  = seg.greenPct === bestGreen  && thirds.length > 1;
        const isWorst = seg.greenPct === worstGreen && seg.greenPct !== bestGreen;
        const cls = isBest ? 'best' : (isWorst ? 'worst' : '');
        const gPct = Math.round(seg.greenPct);
        const yPct = Math.max(0, Math.round((100 - gPct) * 0.6));
        const rPct = Math.max(0, 100 - gPct - yPct);

        return `
        <div class="segment-card ${cls}">
            <div class="segment-card-title">
                ${label}
                ${isBest  ? ' 🏆' : ''}
                ${isWorst ? ' ⚠️' : ''}
            </div>
            <div class="segment-metric">Avg Angle: <strong>${seg.avgAngle}°</strong></div>
            <div class="segment-metric">Max Angle: <strong>${seg.maxAngle}°</strong></div>
            <div class="segment-metric">Vibrations: <strong>${seg.vibrations}</strong></div>
            <div class="segment-metric">Green Zone: <strong>${seg.greenPct}%</strong></div>
            <div class="segment-zone-bars">
                <div class="zone-bar-g" style="flex:${gPct};"></div>
                <div class="zone-bar-y" style="flex:${yPct};"></div>
                <div class="zone-bar-r" style="flex:${rPct};"></div>
            </div>
        </div>
        `;
    }

    let best60html = '';
    let worst60html = '';
    if (segments.best_60s) {
        const t = formatMs(segments.best_60s.startMs);
        best60html = `<div style="font-size:0.83rem;color:#2e7d32;margin-top:6px;">🏆 Best 60s: starts at ${t}, avg ${segments.best_60s.avgAngle}°</div>`;
    }
    if (segments.worst_60s) {
        const t = formatMs(segments.worst_60s.startMs);
        worst60html = `<div style="font-size:0.83rem;color:#c62828;margin-top:2px;">⚠️ Worst 60s: starts at ${t}, avg ${segments.worst_60s.avgAngle}°</div>`;
    }

    container.innerHTML = `
        <div class="segment-comparison-grid">
            ${segCard(ft, 'First 1/3')}
            ${segCard(mt, 'Middle 1/3')}
            ${segCard(lt, 'Last 1/3')}
        </div>
        ${best60html}
        ${worst60html}
    `;
}

// ═══════════════════════════════════════════════════════════
// UI SECTION 12: Longitudinal Comparison
// ═══════════════════════════════════════════════════════════

function renderLongitudinalComparison(containerId, currentSession, trends) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!trends || !trends.lastSession) {
        container.innerHTML = `
            <div class="no-history-state">
                <div class="nh-icon">📈</div>
                <p>Complete more training sessions to see your progress comparison here.</p>
            </div>
        `;
        return;
    }

    const last = trends.lastSession;
    const curr = currentSession;

    function delta(currVal, lastVal, lowerIsBetter = true, noChangeThr = 0.5) {
        if (currVal === null || lastVal === null) return null;
        const diff = currVal - lastVal;
        const pct  = lastVal !== 0 ? Math.abs(diff / lastVal * 100).toFixed(0) : 0;
        const better = lowerIsBetter ? diff < 0 : diff > 0;
        if (Math.abs(diff) < noChangeThr) return { diff: 0, pct: 0, cls: 'delta-same', label: 'No change' };
        const sign = diff > 0 ? '+' : '';
        return {
            diff, pct,
            cls: better ? 'delta-better' : 'delta-worse',
            label: better
                ? `↓ Improved ${pct}%`
                : `↑ Declined ${pct}%`
        };
    }

    const rula  = delta(curr.rulaScore,      last.rulaScore,      true, 0.1);
    const green = delta(curr.greenPct,        last.greenPct,       false);
    const vib   = delta(curr.vibrationCount,  last.vibrationCount, true);

    function metricCard(label, currVal, lastVal, unit, d) {
        return `
        <div class="compare-metric-card">
            <div class="compare-metric-label">${label}</div>
            <div class="compare-metric-value">${currVal !== null ? currVal : '--'}${unit}</div>
            ${d ? `<div class="compare-metric-delta ${d.cls}">${d.label}</div>` : ''}
            <div style="font-size:0.72rem;color:var(--md-sys-color-on-surface-variant);margin-top:2px;">Last: ${lastVal !== null ? lastVal : '--'}${unit}</div>
        </div>`;
    }

    // Recent 5 sparkline data
    const sparklineData = (window._gamSessions || []).slice(0, 5).map(s => s.rulaScore).reverse();

    const trendLabel = {
        improving: '📈 Improving',
        stable:    '➡️ Stable',
        declining: '📉 Declining'
    }[trends.trend] || '';

    const trendClass = {
        improving: 'trend-up',
        stable:    'trend-flat',
        declining: 'trend-down'
    }[trends.trend] || 'trend-flat';

    let pbHtml = '';
    if (trends.personalBest) {
        const pb = trends.personalBest;
        const pbDate = new Date(pb.timestamp).toLocaleDateString('en-US');
        pbHtml = `
        <div class="personal-best-row">
            <div class="personal-best-icon">🥇</div>
            <div class="personal-best-info">
                <div class="personal-best-title">Personal Best: RULA ${(+pb.rulaScore).toFixed(1)}</div>
                <div class="personal-best-sub">${pb.filename || ''} · ${pbDate} · Green ${pb.greenPct.toFixed(1)}%</div>
            </div>
        </div>`;
    }

    container.innerHTML = `
        <div class="longitudinal-panel">
            <div class="longitudinal-compare-row">
                ${metricCard('RULA Risk Score', (+curr.rulaScore).toFixed(1), (+last.rulaScore).toFixed(1), '',  rula)}
                ${metricCard('Green Zone',       curr.greenPct.toFixed(1), last.greenPct.toFixed(1), '%', green)}
                ${metricCard('Vibrations',        curr.vibrationCount, last.vibrationCount, '', vib)}
            </div>
            ${sparklineData.length >= 2 ? `
            <div class="sparkline-container">
                <div class="sparkline-title">
                    <span>Last 5 Sessions RULA Trend</span>
                    <span class="${trendClass}">${trendLabel}</span>
                </div>
                <div class="sparkline-canvas-wrapper">
                    <canvas id="gamSparklineCanvas" height="64"></canvas>
                </div>
            </div>` : ''}
            ${trends.thisWeekAvg > 0 ? `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
                <div class="compare-metric-card">
                    <div class="compare-metric-label">This Week Avg RULA</div>
                    <div class="compare-metric-value">${trends.thisWeekAvg}</div>
                    <div style="font-size:0.75rem;color:var(--md-sys-color-on-surface-variant);">${trends.thisWeekCount} sessions</div>
                </div>
                <div class="compare-metric-card">
                    <div class="compare-metric-label">Last Week Avg RULA</div>
                    <div class="compare-metric-value">${trends.lastWeekAvg > 0 ? trends.lastWeekAvg : '--'}</div>
                    <div style="font-size:0.75rem;color:var(--md-sys-color-on-surface-variant);">${trends.lastWeekCount > 0 ? trends.lastWeekCount + ' sessions' : 'No data'}</div>
                </div>
            </div>` : ''}
            ${pbHtml}
        </div>
    `;

    // Draw sparkline chart
    if (sparklineData.length >= 2) {
        setTimeout(() => drawSparkline('gamSparklineCanvas', sparklineData), 50);
    }
}

function drawSparkline(canvasId, data) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === 'undefined') return;
    if (canvas._sparkChart) canvas._sparkChart.destroy();

    canvas._sparkChart = new Chart(canvas, {
        type: 'line',
        data: {
            labels: data.map((_, i) => `Session ${i + 1}`),
            datasets: [{
                data,
                borderColor: '#1a5fb4',
                backgroundColor: 'rgba(26,95,180,0.1)',
                borderWidth: 2,
                pointRadius: 4,
                pointBackgroundColor: data.map(v => {
                    if (v <= 25) return '#2e7d32';
                    if (v <= 50) return '#f57f17';
                    if (v <= 75) return '#e65100';
                    return '#b71c1c';
                }),
                tension: 0.3,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { display: false },
                y: { display: true, min: 0, max: 100,
                    ticks: { font: { size: 10 }, stepSize: 25 },
                    grid: { color: 'rgba(0,0,0,0.06)' }
                }
            }
        }
    });
}

// ═══════════════════════════════════════════════════════════
// UI SECTION 13: Progress Profile Modal
// ═══════════════════════════════════════════════════════════

function showProgressProfileModal() {
    const modal = document.getElementById('progressProfileModal');
    if (!modal) return;

    const sessions = window._gamSessions || [];
    const name = getDisplayName();
    const trends = sessions.length > 0 ? TrendCalculator.computeTrends(sessions) : null;

    const statsHtml = sessions.length > 0 ? `
        <div class="profile-stats-row">
            <div class="profile-stat-item">
                <div class="profile-stat-value">${sessions.length}</div>
                <div class="profile-stat-label">Total Sessions</div>
            </div>
            <div class="profile-stat-item">
                <div class="profile-stat-value">${trends ? trends.personalBest ? (+trends.personalBest.rulaScore).toFixed(1) : '--' : '--'}</div>
                <div class="profile-stat-label">Best RULA</div>
            </div>
            <div class="profile-stat-item">
                <div class="profile-stat-value">${trends ? trends.recent5Avg : '--'}</div>
                <div class="profile-stat-label">Last 5 Avg</div>
            </div>
            <div class="profile-stat-item">
                <div class="profile-stat-value">${trends && trends.stabilityIndex !== null ? trends.stabilityIndex : '--'}</div>
                <div class="profile-stat-label">Stability Index</div>
            </div>
            <div class="profile-stat-item">
                <div class="profile-stat-value">${formatDuration(sessions.reduce((s, x) => s + (x.sessionDuration || 0), 0))}</div>
                <div class="profile-stat-label">Total Duration</div>
            </div>
            <div class="profile-stat-item">
                <div class="profile-stat-value">${trends ? trends.longestImprovingStreak : 0}</div>
                <div class="profile-stat-label">Longest Streak</div>
            </div>
        </div>
    ` : '<div class="no-history-state"><div class="nh-icon">📊</div><p>No training history yet</p></div>';

    // Best records table
    let bestsHtml = '';
    if (sessions.length > 0) {
        const sorted = [...sessions].sort((a, b) => a.rulaScore - b.rulaScore);
        const bestRows = sorted.slice(0, 5).map((s, i) => {
            const date = new Date(s.timestamp).toLocaleDateString('en-US');
            return `
            <tr>
                <td>${i + 1}</td>
                <td>${escapeHtml(s.filename || 'Unknown')}</td>
                <td>${date}</td>
                <td style="color:${GAM.RISK_LEVELS[s.riskLevel]?.color || '#333'};font-weight:600">${(+s.rulaScore).toFixed(1)}</td>
                <td>${s.greenPct.toFixed(1)}%</td>
                <td>${formatDuration(s.sessionDuration)}</td>
            </tr>`;
        }).join('');

        bestsHtml = `
        <h4 style="margin-top:20px;margin-bottom:10px;">🏆 Best Training Records</h4>
        <table class="profile-bests-table">
            <thead><tr>
                <th>#</th><th>File</th><th>Date</th>
                <th>RULA</th><th>Green</th><th>Duration</th>
            </tr></thead>
            <tbody>${bestRows}</tbody>
        </table>`;
    }

    // Timeline chart
    const timelineHtml = sessions.length >= 2 ? `
        <h4 style="margin-top:20px;margin-bottom:10px;">📈 RULA Risk Score Trend</h4>
        <canvas id="profileTimelineCanvas" height="160"></canvas>
    ` : '';

    const content = document.getElementById('progressProfileContent');
    if (content) {
        content.innerHTML = `
            <div class="profile-header">
                <div class="profile-avatar-lg">${getAvatarInitials(name)}</div>
                <div>
                    <div style="font-size:1.2rem;font-weight:700;">${escapeHtml(name)}</div>
                    <div style="font-size:0.82rem;color:var(--md-sys-color-on-surface-variant);">Posture Training Profile</div>
                </div>
            </div>
            ${statsHtml}
            ${timelineHtml}
            ${bestsHtml}
        `;

        if (sessions.length >= 2) {
            setTimeout(() => drawProfileTimeline('profileTimelineCanvas', sessions), 50);
        }
    }

    modal.classList.remove('hidden');
}

function drawProfileTimeline(canvasId, sessions) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === 'undefined') return;
    if (canvas._profileChart) canvas._profileChart.destroy();

    const sorted = [...sessions].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    const labels = sorted.map(s => new Date(s.timestamp).toLocaleDateString('en-US'));
    const scores = sorted.map(s => s.rulaScore);

    canvas._profileChart = new Chart(canvas, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'RULA Risk Score',
                data: scores,
                borderColor: '#1a5fb4',
                backgroundColor: 'rgba(26,95,180,0.08)',
                borderWidth: 2.5,
                pointRadius: 6,
                pointBackgroundColor: scores.map(v => {
                    if (v <= 25)  return '#2e7d32';
                    if (v <= 50)  return '#f57f17';
                    if (v <= 75)  return '#e65100';
                    return '#b71c1c';
                }),
                tension: 0.3,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => {
                            const s = sorted[ctx.dataIndex];
                            const level = GAM.RISK_LEVELS[s.riskLevel];
                            return [
                                `RULA: ${s.rulaScore} (${level ? level.label : ''})`,
                                `Green: ${s.greenPct.toFixed(1)}%`
                            ];
                        }
                    }
                }
            },
            scales: {
                y: {
                    min: 0, max: 100,
                    title: { display: true, text: 'RULA Risk Score' },
                    ticks: { stepSize: 25 },
                    grid: { color: 'rgba(0,0,0,0.06)' }
                },
                x: { ticks: { maxRotation: 45, font: { size: 10 } } }
            }
        }
    });
}

// ═══════════════════════════════════════════════════════════
// UI SECTION 14: Group Panel (Features 14–17)
// ═══════════════════════════════════════════════════════════

async function renderGroupPanel() {
    const container = document.getElementById('groupPanelContent');
    if (!container) return;

    const serverOk = await GroupAPI.checkServerAvailable().catch(() => false);
    if (!serverOk) {
        container.innerHTML = `<div class="group-offline-notice">Server not running. Group features require a connection to the production server.</div>`;
        return;
    }

    container.innerHTML = '<div class="gam-loading"><div class="gam-loading-spinner"></div> Loading...</div>';

    const myGroupId = localStorage.getItem('wergonic_group_id');

    try {
        if (myGroupId) {
            renderGroupTabs(container, myGroupId);
        } else {
            renderGroupJoinCreate(container);
        }
    } catch (e) {
        container.innerHTML = `<div class="gam-placeholder">Failed to load group data: ${e.message}</div>`;
    }
}

function renderGroupJoinCreate(container) {
    container.innerHTML = `
        <div style="margin-bottom:16px;">
            <div style="font-size:0.88rem;color:var(--md-sys-color-on-surface-variant);margin-bottom:10px;">
                Join or create a group to collaborate on posture improvement with your classmates!
            </div>
            <div class="group-form">
                <input type="text" id="groupNameInput" placeholder="Group name (e.g. Class A)" maxlength="40">
                <button class="btn btn-primary btn-small" id="createGroupBtn">Create</button>
                <button class="btn btn-secondary btn-small" id="joinGroupBtn">Join</button>
            </div>
        </div>
        <div id="groupListContainer"></div>
    `;

    document.getElementById('createGroupBtn').addEventListener('click', async () => {
        const name = document.getElementById('groupNameInput').value.trim();
        if (!name) return;
        try {
            const group = await GroupAPI.createGroup(name);
            localStorage.setItem('wergonic_group_id', group.groupId);
            await renderGroupPanel();
        } catch (e) { alert('Failed to create group: ' + e.message); }
    });

    document.getElementById('joinGroupBtn').addEventListener('click', async () => {
        const name = document.getElementById('groupNameInput').value.trim();
        if (!name) return;
        try {
            const groups = await GroupAPI.listGroups();
            const match = groups.find(g => g.name === name);
            if (!match) { alert('Group not found: ' + name); return; }
            await GroupAPI.joinGroup(match.groupId);
            localStorage.setItem('wergonic_group_id', match.groupId);
            await renderGroupPanel();
        } catch (e) { alert('Failed to join group: ' + e.message); }
    });

    GroupAPI.listGroups().then(groups => {
        const listContainer = document.getElementById('groupListContainer');
        if (!listContainer) return;
        if (groups.length === 0) {
            listContainer.innerHTML = '<div class="gam-placeholder">No groups yet. Create the first one!</div>';
            return;
        }
        listContainer.innerHTML = `
            <div style="font-size:0.82rem;color:var(--md-sys-color-on-surface-variant);margin-bottom:6px;">Existing groups:</div>
            ${groups.map(g => `
                <div style="padding:6px 10px;background:var(--md-sys-color-surface-container-low);border-radius:8px;margin-bottom:4px;font-size:0.88rem;display:flex;align-items:center;justify-content:space-between;">
                    <span>${escapeHtml(g.name)}</span>
                    <span style="color:var(--md-sys-color-on-surface-variant);font-size:0.78rem;">${g.memberIds ? g.memberIds.length : 0} members</span>
                </div>`).join('')}
        `;
    }).catch(() => {});
}

// ── Tab system for group panel ────────────────────────────────

function renderGroupTabs(container, groupId) {
    container.innerHTML = `
        <div class="group-csv-upload-strip">
            <label class="group-csv-upload-btn" for="groupCSVInput">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                Upload CSV Session
            </label>
            <input type="file" id="groupCSVInput" accept=".csv" style="display:none">
            <span id="groupCSVStatus" class="group-csv-status"></span>
        </div>
        <div class="group-tabs">
            <button class="group-tab active" data-tab="performance">My Stats</button>
            <button class="group-tab" data-tab="goal">Group Goal</button>
            <button class="group-tab" data-tab="season">Season</button>
            <button class="group-tab" data-tab="leaderboard">Leaderboard</button>
        </div>
        <div id="groupTabContent" class="group-tab-content"></div>
    `;

    const tabBtns = container.querySelectorAll('.group-tab');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            loadGroupTab(btn.dataset.tab, groupId);
        });
    });

    const fileInput = container.querySelector('#groupCSVInput');
    fileInput.addEventListener('change', e => {
        const file = e.target.files[0];
        if (file) handleGroupCSVUpload(file, groupId);
        fileInput.value = '';
    });

    // Drop zone on the upload strip
    const strip = container.querySelector('.group-csv-upload-strip');
    strip.addEventListener('dragover', e => { e.preventDefault(); strip.classList.add('drag-over'); });
    strip.addEventListener('dragleave', () => strip.classList.remove('drag-over'));
    strip.addEventListener('drop', e => {
        e.preventDefault();
        strip.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file && file.name.endsWith('.csv')) handleGroupCSVUpload(file, groupId);
    });

    // Load default tab
    loadGroupTab('performance', groupId);
}

async function handleGroupCSVUpload(file, groupId) {
    const status = document.getElementById('groupCSVStatus');
    if (!status) return;

    if (typeof parseCSVData !== 'function' || typeof calculateStatistics !== 'function') {
        status.textContent = 'Parser not available — open a session in the main app first.';
        status.className = 'group-csv-status error';
        return;
    }

    status.textContent = 'Reading…';
    status.className = 'group-csv-status loading';

    let text;
    try {
        text = await file.text();
    } catch (e) {
        status.textContent = 'Could not read file.';
        status.className = 'group-csv-status error';
        return;
    }

    const data = parseCSVData(text);
    if (!data || data.length < 6) {
        status.textContent = 'CSV appears empty or has too few rows.';
        status.className = 'group-csv-status error';
        return;
    }

    const metadata = { threshold_yellow: '30', threshold_red: '60' };
    const stats = calculateStatistics(data, metadata);
    const summary = buildSessionSummary(data, metadata, stats, file.name);

    try {
        await GamificationDB.saveSession(summary);
        if (groupId) {
            await GroupAPI.uploadSession(summary, groupId);
        }
        const dur = stats.totalTime ? ` (${Math.round(stats.totalTime)}s)` : '';
        status.textContent = `✓ Uploaded: ${escapeHtml(file.name)}${dur}`;
        status.className = 'group-csv-status success';

        // Refresh active tab so new stats appear
        const activeTab = document.querySelector('.group-tab.active');
        if (activeTab) loadGroupTab(activeTab.dataset.tab, groupId);
    } catch (e) {
        status.textContent = `Upload failed: ${escapeHtml(e.message)}`;
        status.className = 'group-csv-status error';
    }
}

async function loadGroupTab(tab, groupId) {
    const content = document.getElementById('groupTabContent');
    if (!content) return;
    content.innerHTML = '<div class="gam-loading"><div class="gam-loading-spinner"></div></div>';

    try {
        switch (tab) {
            case 'performance': await renderGroupPerformanceTab(content, groupId); break;
            case 'goal':        await renderGroupGoalTab(content, groupId);        break;
            case 'season':      await renderGroupSeasonTab(content, groupId);      break;
            case 'leaderboard': await renderInterGroupLeaderboard(content);        break;
        }
    } catch (e) {
        content.innerHTML = `<div class="gam-placeholder">Failed to load: ${escapeHtml(e.message)}</div>`;
    }
}

// ── Feature 14: Group Performance Comparison ─────────────────

async function renderGroupPerformanceTab(container, groupId) {
    const stats     = await GroupAPI.getGroupStats(groupId);
    const myUserId  = getUserId();
    const members   = stats.members || [];
    const withData  = members.filter(m => m.avgRula !== null);

    // Group average
    const groupAvg = withData.length > 0
        ? withData.reduce((s, m) => s + m.avgRula, 0) / withData.length
        : null;

    // My place (anonymous range — no exact rank shown)
    const me         = members.find(m => m.userId === myUserId);
    const myAvgRula  = me ? me.avgRula : null;

    let percentileBand = null;
    if (myAvgRula !== null && withData.length >= 2) {
        // Lower RULA = better. pct = fraction of members with RULA <= mine
        const betterOrEqual = withData.filter(m => m.avgRula <= myAvgRula).length;
        const pct = betterOrEqual / withData.length;
        if (pct >= 0.75)      percentileBand = { label: 'Top 25%',   icon: '🏆', color: '#2e7d32', bg: '#e8f5e9' };
        else if (pct >= 0.5)  percentileBand = { label: 'Top 50%',   icon: '⭐', color: '#1565c0', bg: '#e3f2fd' };
        else if (pct >= 0.25) percentileBand = { label: 'Lower 50%', icon: '📈', color: '#f57f17', bg: '#fff9c4' };
        else                  percentileBand = { label: 'Lower 25%', icon: '💪', color: '#e65100', bg: '#fff3e0' };
    }

    // Risk distribution buckets across the group
    const buckets = { low: 0, moderate: 0, high: 0, very_high: 0 };
    withData.forEach(m => { buckets[riskLevelFromScore(m.avgRula)]++; });
    const total = withData.length || 1;
    const distColors = { low: '#2e7d32', moderate: '#f57f17', high: '#e65100', very_high: '#b71c1c' };
    const distBar = Object.entries(buckets).map(([level, count]) => {
        const pct = (count / total) * 100;
        return pct > 0 ? `<div class="group-dist-seg" style="width:${pct.toFixed(1)}%;background:${distColors[level]}" title="${level}: ${count}"></div>` : '';
    }).join('');

    const myScoreHtml = myAvgRula !== null
        ? `<span class="group-my-score">Your avg RULA: <strong>${myAvgRula.toFixed(0)}</strong></span>`
        : `<span class="group-my-score">No sessions this period</span>`;

    const bandHtml = percentileBand
        ? `<div class="group-percentile-band" style="background:${percentileBand.bg};border-color:${percentileBand.color};">
               <span class="gp-icon">${percentileBand.icon}</span>
               <div>
                   <div class="gp-label">${percentileBand.label} of your group</div>
                   <div class="gp-sublabel">Based on 7-day average RULA score (lower = better)</div>
               </div>
           </div>`
        : `<div class="gam-placeholder">Complete sessions to see your group ranking</div>`;

    container.innerHTML = `
        <div class="group-perf-section">
            <div class="group-perf-header">
                <span>📍 ${escapeHtml(stats.name || 'Your Group')}</span>
                <button class="group-leave-btn" id="leaveGroupBtn">Leave</button>
            </div>

            ${bandHtml}

            <div class="group-avg-row">
                <span>Group average RULA:</span>
                <strong>${groupAvg !== null ? groupAvg.toFixed(1) : '--'}</strong>
                ${myScoreHtml}
            </div>

            <div class="group-dist-label">Group risk distribution (${withData.length} member${withData.length !== 1 ? 's' : ''} with data):</div>
            <div class="group-dist-bar">${distBar || '<div class="gam-placeholder">No data yet</div>'}</div>
            <div class="group-dist-legend">
                ${Object.entries(distColors).map(([k, c]) => `<span style="color:${c};">■ ${k.replace('_', ' ')}: ${buckets[k]}</span>`).join(' · ')}
            </div>

            <div style="margin-top:12px;font-size:0.78rem;color:var(--md-sys-color-on-surface-variant);">
                Individual rankings are not displayed to protect privacy.
            </div>
        </div>
    `;

    document.getElementById('leaveGroupBtn') && document.getElementById('leaveGroupBtn').addEventListener('click', async () => {
        if (!confirm('Are you sure you want to leave the group?')) return;
        try {
            await GroupAPI.leaveGroup(localStorage.getItem('wergonic_group_id'));
            localStorage.removeItem('wergonic_group_id');
            await renderGroupPanel();
        } catch (e) { alert('Failed to leave: ' + e.message); }
    });
}

// ── Feature 15: Group Shared Goals ───────────────────────────

async function renderGroupGoalTab(container, groupId) {
    const { goal, progress, progressPct, season } = await GroupAPI.getGroupGoals(groupId);
    const myGroupId = localStorage.getItem('wergonic_group_id');

    let goalHtml = '';

    if (goal) {
        const barColor = progressPct >= 100 ? '#2e7d32' : (progressPct >= 50 ? '#1565c0' : '#f57f17');
        let progressDetail = '';
        if (goal.type === 'reduce_risk') {
            progressDetail = `Group avg RULA: <strong>${progress.avgRula !== null ? progress.avgRula : '--'}</strong> (target: below ${goal.target})`;
        } else {
            progressDetail = `<strong>${progress.membersReached}/${progress.totalMembers}</strong> members reached ${goal.target} session${goal.target !== 1 ? 's' : ''}`;
        }

        goalHtml = `
            <div class="goal-card">
                <div class="goal-card-title">${escapeHtml(goal.description || (goal.type === 'reduce_risk' ? 'Reduce Group Risk Score' : 'Complete Training Sessions'))}</div>
                <div class="goal-type-badge">${goal.type === 'reduce_risk' ? '📉 Risk Reduction' : '🏃 Session Count'}</div>
                <div class="goal-progress-wrap">
                    <div class="goal-progress-bar">
                        <div class="goal-progress-fill" style="width:${Math.min(100, progressPct)}%;background:${barColor};"></div>
                    </div>
                    <span class="goal-progress-pct">${progressPct}%</span>
                </div>
                <div class="goal-detail">${progressDetail}</div>
                ${progressPct >= 100 ? '<div class="goal-complete">🎉 Goal completed this season!</div>' : ''}
            </div>
        `;
    } else {
        goalHtml = `<div class="gam-placeholder">No goal set for this season yet.</div>`;
    }

    container.innerHTML = `
        <div class="group-goal-section">
            <div class="goal-season-note">Season ${season.seasonNumber}: <strong>${escapeHtml(season.name)}</strong> · ${season.daysRemaining}d remaining</div>
            ${goalHtml}
            <div class="goal-set-form" id="goalSetForm">
                <div class="goal-form-title">Set a New Group Goal</div>
                <div class="goal-form-row">
                    <select id="goalTypeSelect" class="goal-select">
                        <option value="reduce_risk">Reduce average risk below a target</option>
                        <option value="session_count">Every member completes N sessions</option>
                    </select>
                </div>
                <div class="goal-form-row">
                    <input type="number" id="goalTargetInput" class="goal-input" min="1" max="200" value="40" placeholder="Target value">
                    <span id="goalTargetHint" class="goal-target-hint">max avg RULA score</span>
                </div>
                <div class="goal-form-row">
                    <input type="text" id="goalDescInput" class="goal-input" maxlength="80" placeholder="Goal description (optional)">
                </div>
                <button class="btn btn-primary btn-small" id="setGoalBtn">Set Goal</button>
            </div>
        </div>
    `;

    // Update hint when type changes
    document.getElementById('goalTypeSelect').addEventListener('change', function() {
        const hint = document.getElementById('goalTargetHint');
        hint.textContent = this.value === 'reduce_risk' ? 'max avg RULA score' : 'sessions per member';
        document.getElementById('goalTargetInput').value = this.value === 'reduce_risk' ? '40' : '3';
    });

    document.getElementById('setGoalBtn').addEventListener('click', async () => {
        const type   = document.getElementById('goalTypeSelect').value;
        const target = parseFloat(document.getElementById('goalTargetInput').value);
        const desc   = document.getElementById('goalDescInput').value.trim();
        if (!target || target <= 0) { alert('Please enter a valid target value.'); return; }
        try {
            await GroupAPI.setGroupGoal(myGroupId, type, target, desc);
            await renderGroupGoalTab(container, groupId);
        } catch (e) { alert('Failed to set goal: ' + e.message); }
    });
}

// ── Feature 16: Group Season System ──────────────────────────

async function renderGroupSeasonTab(container, groupId) {
    const [season, stats] = await Promise.all([
        GroupAPI.getCurrentSeason(),
        GroupAPI.getGroupStats(groupId)
    ]);

    const members    = (stats.members || []).filter(m => m.avgRula !== null);
    const groupAvg   = members.length > 0 ? members.reduce((s, m) => s + m.avgRula, 0) / members.length : null;
    const sessionCnt = members.reduce((s, m) => s + (m.sessionCount || 0), 0);

    // Season progress bar (days elapsed / 14)
    const start       = new Date(season.startDate);
    const end         = new Date(season.endDate);
    const now         = new Date();
    const totalDays   = 14;
    const elapsed     = Math.max(0, Math.min(totalDays, (now - start) / (24 * 60 * 60 * 1000)));
    const seasonPct   = Math.round((elapsed / totalDays) * 100);

    const deviceBadge = season.deviceFocus === 'both' ? '🔄 All devices'
        : (season.deviceFocus === 'arm' ? '💪 ARM focus' : '🧍 TRUNK focus');

    const avgColor = groupAvg !== null ? (GAM.RISK_LEVELS[riskLevelFromScore(Math.round(groupAvg))].color) : '#aaa';

    container.innerHTML = `
        <div class="season-card">
            <div class="season-header">
                <div class="season-number">Season ${season.seasonNumber}</div>
                <div class="season-name">${escapeHtml(season.name)}</div>
                <div class="season-device-badge">${deviceBadge}</div>
            </div>
            <div class="season-description">${escapeHtml(season.description)}</div>

            <div class="season-timeline">
                <div class="season-timeline-bar">
                    <div class="season-timeline-fill" style="width:${seasonPct}%"></div>
                </div>
                <div class="season-timeline-labels">
                    <span>${start.toLocaleDateString(undefined, { month:'short', day:'numeric' })}</span>
                    <span>${season.daysRemaining} day${season.daysRemaining !== 1 ? 's' : ''} remaining</span>
                    <span>${end.toLocaleDateString(undefined, { month:'short', day:'numeric' })}</span>
                </div>
            </div>

            <div class="season-stats-row">
                <div class="season-stat">
                    <div class="season-stat-value" style="color:${avgColor}">${groupAvg !== null ? groupAvg.toFixed(1) : '--'}</div>
                    <div class="season-stat-label">Group avg RULA</div>
                </div>
                <div class="season-stat">
                    <div class="season-stat-value">${sessionCnt}</div>
                    <div class="season-stat-label">Total sessions</div>
                </div>
                <div class="season-stat">
                    <div class="season-stat-value">${members.length}</div>
                    <div class="season-stat-label">Active members</div>
                </div>
            </div>
        </div>

        <div class="season-upcoming-note">
            <strong>Next season:</strong> ${getNextSeasonName(season.seasonNumber)}
        </div>
    `;
}

function getNextSeasonName(currentNum) {
    const THEMES = ['Back Awareness', 'Arm Precision', 'Recovery Sprint', 'Consistency Challenge', 'Total Wellness'];
    return THEMES[currentNum % THEMES.length];
}

// ── Feature 17: Inter-group Leaderboard ──────────────────────

async function renderInterGroupLeaderboard(container) {
    const { leaderboard, season } = await GroupAPI.getLeaderboard();
    const myGroupId = localStorage.getItem('wergonic_group_id');

    if (!leaderboard || leaderboard.length === 0) {
        container.innerHTML = `
            <div class="leaderboard-header">Season ${season.seasonNumber}: <strong>${escapeHtml(season.name)}</strong></div>
            <div class="gam-placeholder">No group data for this season yet. Complete sessions to appear here!</div>`;
        return;
    }

    const rows = leaderboard.map((g, i) => {
        const isMyGroup  = g.groupId === myGroupId;
        const rankIcon   = i === 0 ? '🥇' : (i === 1 ? '🥈' : (i === 2 ? '🥉' : `#${i + 1}`));
        const levelColor = GAM.RISK_LEVELS[riskLevelFromScore(Math.round(g.avgRula || 0))].color;
        return `
            <div class="inter-lb-row ${isMyGroup ? 'my-group-row' : ''}">
                <div class="inter-lb-rank">${rankIcon}</div>
                <div class="inter-lb-name">${escapeHtml(g.name)}${isMyGroup ? ' ★' : ''}</div>
                <div class="inter-lb-members">${g.memberCount} members</div>
                <div class="inter-lb-score" style="color:${levelColor}">${g.avgRula !== null ? g.avgRula.toFixed(1) : '--'}</div>
                <div class="inter-lb-sessions">${g.totalSessions} sessions</div>
            </div>`;
    }).join('');

    container.innerHTML = `
        <div class="leaderboard-header">
            Season ${season.seasonNumber}: <strong>${escapeHtml(season.name)}</strong>
            <span class="lb-days-left">${season.daysRemaining}d left</span>
        </div>
        <div class="inter-lb-legend">Avg RULA score (lower = better posture) · Individual data is never shown</div>
        <div class="inter-leaderboard">
            <div class="inter-lb-head">
                <div></div><div>Group</div><div>Members</div><div>Avg RULA</div><div>Sessions</div>
            </div>
            ${rows}
        </div>
    `;
}

// ═══════════════════════════════════════════════════════════
// UI SECTION 15: Teacher Segment Analysis
// ═══════════════════════════════════════════════════════════

const TeacherAnalysis = {
    regionA: null,
    regionB: null,
    activeRegion: 'A',
    isDragging: false,
    dragStartX: null,
    fullData: null,

    init(data) {
        this.fullData = data;
        this.regionA = null;
        this.regionB = null;

        this._setupDragSelect();
        this._updateRegionButtons();
        this._renderTable();
    },

    _setupDragSelect() {
        const chartWrapper = document.getElementById('reportChartWrapper');
        const chartCanvas  = document.getElementById('reportChart');
        if (!chartWrapper || !chartCanvas) return;

        const self = this;

        chartCanvas.addEventListener('mousedown', (e) => {
            const rect = chartCanvas.getBoundingClientRect();
            self.dragStartX = (e.clientX - rect.left) / chartCanvas.offsetWidth;
            self.isDragging = true;
        });

        chartCanvas.addEventListener('mousemove', (e) => {
            if (!self.isDragging) return;
            const rect = chartCanvas.getBoundingClientRect();
            const x = (e.clientX - rect.left) / chartCanvas.offsetWidth;
            self._updateDragOverlay(self.dragStartX, x);
        });

        chartCanvas.addEventListener('mouseup', (e) => {
            if (!self.isDragging) return;
            self.isDragging = false;
            const rect = chartCanvas.getBoundingClientRect();
            const x = (e.clientX - rect.left) / chartCanvas.offsetWidth;
            self._setRegion(Math.min(self.dragStartX, x), Math.max(self.dragStartX, x));
            self._clearDragOverlay();
        });

        chartCanvas.addEventListener('mouseleave', () => {
            if (self.isDragging) {
                self.isDragging = false;
                self._clearDragOverlay();
            }
        });
    },

    _setRegion(startPct, endPct) {
        const data = this.fullData;
        if (!data || data.length === 0) return;

        const totalDuration = data[data.length - 1].adjusted_elapsed_ms - data[0].adjusted_elapsed_ms;
        const startMs = data[0].adjusted_elapsed_ms + totalDuration * startPct;
        const endMs   = data[0].adjusted_elapsed_ms + totalDuration * endPct;
        const seg     = data.filter(d => d.adjusted_elapsed_ms >= startMs && d.adjusted_elapsed_ms <= endMs);

        const regionData = {
            startPct, endPct,
            startMs, endMs,
            stats: this._computeSegStats(seg),
            label: `${(totalDuration * startPct / 1000).toFixed(1)}s – ${(totalDuration * endPct / 1000).toFixed(1)}s`
        };

        if (this.activeRegion === 'A') {
            this.regionA = regionData;
        } else {
            this.regionB = regionData;
        }

        this._renderOverlays();
        this._renderTable();
    },

    _computeSegStats(seg) {
        if (!seg || seg.length === 0) return { avg: 0, max: 0, greenPct: 0, vibrations: 0 };
        const angles  = seg.map(d => d.angle);
        const avg     = angles.reduce((s, x) => s + x, 0) / angles.length;
        const max     = Math.max(...angles);
        const greenN  = seg.filter(d => d.zone === 'green').length;
        const greenPct = greenN / seg.length * 100;
        const vibrations = countVibrations(seg);
        return {
            avg:       parseFloat(avg.toFixed(2)),
            max:       parseFloat(max.toFixed(2)),
            greenPct:  parseFloat(greenPct.toFixed(1)),
            vibrations
        };
    },

    _updateDragOverlay(startPct, endPct) {
        let overlay = document.getElementById('teacherDragOverlay');
        const wrapper = document.getElementById('reportChartWrapper');
        if (!wrapper) return;
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'teacherDragOverlay';
            overlay.className = `chart-selection-overlay ${this.activeRegion === 'B' ? 'region-b-overlay' : ''}`;
            wrapper.appendChild(overlay);
        }
        const minX = Math.min(startPct, endPct);
        const maxX = Math.max(startPct, endPct);
        overlay.style.left   = `${minX * 100}%`;
        overlay.style.width  = `${(maxX - minX) * 100}%`;
    },

    _clearDragOverlay() {
        const overlay = document.getElementById('teacherDragOverlay');
        if (overlay) overlay.remove();
    },

    _renderOverlays() {
        ['teacherOverlayA', 'teacherOverlayB'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.remove();
        });
        const wrapper = document.getElementById('reportChartWrapper');
        if (!wrapper) return;

        [['A', this.regionA], ['B', this.regionB]].forEach(([key, region]) => {
            if (!region) return;
            const overlay = document.createElement('div');
            overlay.id = `teacherOverlay${key}`;
            overlay.className = `chart-selection-overlay${key === 'B' ? ' region-b-overlay' : ''}`;
            overlay.style.left  = `${region.startPct * 100}%`;
            overlay.style.width = `${(region.endPct - region.startPct) * 100}%`;
            overlay.style.opacity = '0.5';
            wrapper.appendChild(overlay);
        });
    },

    _updateRegionButtons() {
        const btnA = document.getElementById('teacherRegionBtnA');
        const btnB = document.getElementById('teacherRegionBtnB');
        if (btnA) btnA.classList.toggle('active', this.activeRegion === 'A');
        if (btnB) btnB.classList.toggle('active', this.activeRegion === 'B');
    },

    _renderTable() {
        const container = document.getElementById('teacherAbTable');
        if (!container) return;

        if (!this.regionA && !this.regionB) {
            container.innerHTML = '<div class="gam-placeholder">Drag on the chart above to select segments A and B</div>';
            return;
        }

        const a = this.regionA;
        const b = this.regionB;

        function fmt(val, unit = '') { return val !== undefined ? `${val}${unit}` : '--'; }

        function deltaCell(aVal, bVal, lowerBetter = true) {
            if (aVal === undefined || bVal === undefined) return '<td class="cell-delta">--</td>';
            const diff = bVal - aVal;
            const better = lowerBetter ? diff < 0 : diff > 0;
            const cls  = Math.abs(diff) < 0.3 ? '' : (better ? 'better' : 'worse');
            const sign = diff > 0 ? '+' : '';
            return `<td class="cell-delta ${cls}">${sign}${parseFloat(diff.toFixed(2))}</td>`;
        }

        container.innerHTML = `
        <table class="ab-comparison-table">
            <thead>
                <tr>
                    <th>Metric</th>
                    <th>Segment A<br><small>${a ? a.label : '--'}</small></th>
                    <th>Segment B<br><small>${b ? b.label : '--'}</small></th>
                    <th>Delta (B-A)</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>Avg Angle</td>
                    <td class="cell-a">${a ? fmt(a.stats.avg, '°') : '--'}</td>
                    <td class="cell-b">${b ? fmt(b.stats.avg, '°') : '--'}</td>
                    ${deltaCell(a && a.stats.avg, b && b.stats.avg, true)}
                </tr>
                <tr>
                    <td>Max Angle</td>
                    <td class="cell-a">${a ? fmt(a.stats.max, '°') : '--'}</td>
                    <td class="cell-b">${b ? fmt(b.stats.max, '°') : '--'}</td>
                    ${deltaCell(a && a.stats.max, b && b.stats.max, true)}
                </tr>
                <tr>
                    <td>Green Zone</td>
                    <td class="cell-a">${a ? fmt(a.stats.greenPct, '%') : '--'}</td>
                    <td class="cell-b">${b ? fmt(b.stats.greenPct, '%') : '--'}</td>
                    ${deltaCell(a && a.stats.greenPct, b && b.stats.greenPct, false)}
                </tr>
                <tr>
                    <td>Vibrations</td>
                    <td class="cell-a">${a ? a.stats.vibrations : '--'}</td>
                    <td class="cell-b">${b ? b.stats.vibrations : '--'}</td>
                    ${deltaCell(a && a.stats.vibrations, b && b.stats.vibrations, true)}
                </tr>
            </tbody>
        </table>`;
    }
};

// ═══════════════════════════════════════════════════════════
// UI SECTION 16: Body Heatmap
// ═══════════════════════════════════════════════════════════

function renderBodyHeatmap(containerId, session) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Compute risk color for each region based on deviceType + metrics
    function riskColor(pct) {
        // pct = percentage of time in red zone  (0-100 scale from redPct)
        if (pct <= 5)  return '#a5d6a7'; // green
        if (pct <= 15) return '#fff59d'; // yellow
        if (pct <= 30) return '#ffcc80'; // orange
        return '#ef9a9a';                // red
    }

    const dt = session ? (session.deviceType || 'unknown').toLowerCase() : 'unknown';
    const redPct = session ? session.redPct : 0;
    const yellowPct = session ? session.yellowPct : 0;

    // Region risk assignments
    const regions = {
        neck:        { color: '#e0e0e0',  label: 'Neck' },
        shoulder_l:  { color: '#e0e0e0',  label: 'Left Shoulder' },
        shoulder_r:  { color: '#e0e0e0',  label: 'Right Shoulder' },
        upper_arm_l: { color: '#e0e0e0',  label: 'Left Upper Arm' },
        upper_arm_r: { color: '#e0e0e0',  label: 'Right Upper Arm' },
        upper_back:  { color: '#e0e0e0',  label: 'Upper Back' },
        lower_back:  { color: '#e0e0e0',  label: 'Lower Back' }
    };

    if (dt === 'arm') {
        // ARM sensor: shoulder and upper arm are at risk
        regions.shoulder_l.color  = riskColor(redPct * 0.9);
        regions.shoulder_r.color  = riskColor(redPct * 0.9);
        regions.upper_arm_l.color = riskColor(redPct * 0.7);
        regions.upper_arm_r.color = riskColor(redPct * 0.7);
        regions.neck.color        = riskColor(yellowPct * 0.3);
    } else if (dt === 'trunk') {
        // TRUNK sensor: back regions are at risk
        regions.upper_back.color = riskColor(redPct * 0.8);
        regions.lower_back.color = riskColor(redPct * 1.0);
        regions.neck.color       = riskColor(yellowPct * 0.4);
    }

    container.innerHTML = `
        <div class="body-heatmap-container">
            <svg class="body-heatmap-svg" viewBox="0 0 140 280" xmlns="http://www.w3.org/2000/svg">
                <!-- Head -->
                <ellipse cx="70" cy="22" rx="18" ry="22" fill="#f5cba7" stroke="#999" stroke-width="1"/>
                <!-- Neck -->
                <rect id="bh-neck" x="62" y="43" width="16" height="14"
                    fill="${regions.neck.color}" stroke="#999" stroke-width="1" rx="3"
                    class="body-region-label" data-region="neck"/>
                <!-- Torso / Upper back -->
                <rect id="bh-upper-back" x="42" y="57" width="56" height="50"
                    fill="${regions.upper_back.color}" stroke="#999" stroke-width="1" rx="6"
                    class="body-region-label" data-region="upper_back"/>
                <!-- Lower back -->
                <rect id="bh-lower-back" x="42" y="107" width="56" height="40"
                    fill="${regions.lower_back.color}" stroke="#999" stroke-width="1" rx="6"
                    class="body-region-label" data-region="lower_back"/>
                <!-- Left shoulder -->
                <ellipse id="bh-shoulder-l" cx="32" cy="70" rx="12" ry="10"
                    fill="${regions.shoulder_l.color}" stroke="#999" stroke-width="1"
                    class="body-region-label" data-region="shoulder_l"/>
                <!-- Right shoulder -->
                <ellipse id="bh-shoulder-r" cx="108" cy="70" rx="12" ry="10"
                    fill="${regions.shoulder_r.color}" stroke="#999" stroke-width="1"
                    class="body-region-label" data-region="shoulder_r"/>
                <!-- Left upper arm -->
                <rect id="bh-upper-arm-l" x="14" y="78" width="18" height="40"
                    fill="${regions.upper_arm_l.color}" stroke="#999" stroke-width="1" rx="8"
                    class="body-region-label" data-region="upper_arm_l"/>
                <!-- Right upper arm -->
                <rect id="bh-upper-arm-r" x="108" y="78" width="18" height="40"
                    fill="${regions.upper_arm_r.color}" stroke="#999" stroke-width="1" rx="8"
                    class="body-region-label" data-region="upper_arm_r"/>
                <!-- Left forearm -->
                <rect x="10" y="118" width="14" height="36" fill="#f5cba7" stroke="#999" stroke-width="1" rx="6"/>
                <!-- Right forearm -->
                <rect x="116" y="118" width="14" height="36" fill="#f5cba7" stroke="#999" stroke-width="1" rx="6"/>
                <!-- Left hand -->
                <ellipse cx="17" cy="165" rx="9" ry="12" fill="#f5cba7" stroke="#999" stroke-width="1"/>
                <!-- Right hand -->
                <ellipse cx="123" cy="165" rx="9" ry="12" fill="#f5cba7" stroke="#999" stroke-width="1"/>
                <!-- Hip -->
                <rect x="36" y="147" width="68" height="28" fill="#f5cba7" stroke="#999" stroke-width="1" rx="6"/>
                <!-- Left thigh -->
                <rect x="38" y="174" width="26" height="52" fill="#f5cba7" stroke="#999" stroke-width="1" rx="8"/>
                <!-- Right thigh -->
                <rect x="76" y="174" width="26" height="52" fill="#f5cba7" stroke="#999" stroke-width="1" rx="8"/>
                <!-- Left shin -->
                <rect x="40" y="226" width="22" height="36" fill="#f5cba7" stroke="#999" stroke-width="1" rx="6"/>
                <!-- Right shin -->
                <rect x="78" y="226" width="22" height="36" fill="#f5cba7" stroke="#999" stroke-width="1" rx="6"/>
                <!-- Feet -->
                <ellipse cx="51" cy="265" rx="15" ry="8" fill="#f5cba7" stroke="#999" stroke-width="1"/>
                <ellipse cx="89" cy="265" rx="15" ry="8" fill="#f5cba7" stroke="#999" stroke-width="1"/>
            </svg>

            <div class="heatmap-legend">
                <div class="legend-item"><div class="legend-color-box" style="background:#a5d6a7"></div>Low Risk</div>
                <div class="legend-item"><div class="legend-color-box" style="background:#fff59d"></div>Low</div>
                <div class="legend-item"><div class="legend-color-box" style="background:#ffcc80"></div>Moderate</div>
                <div class="legend-item"><div class="legend-color-box" style="background:#ef9a9a"></div>High Risk</div>
            </div>

            <div class="heatmap-region-info" id="heatmapRegionInfo">
                Click a body region for details
            </div>
        </div>
    `;

    // Add click handlers to body regions
    container.querySelectorAll('.body-region-label').forEach(el => {
        el.addEventListener('click', () => {
            const region = el.dataset.region;
            const info   = document.getElementById('heatmapRegionInfo');
            if (!info) return;
            const r = regions[region];
            const riskLabel = getRiskLabelFromColor(r.color);
            info.textContent = `${r.label}：${riskLabel}`;
        });
    });
}

function getRiskLabelFromColor(color) {
    if (color === '#a5d6a7') return 'Low Risk — Good posture control';
    if (color === '#fff59d') return 'Mild Risk — Occasional deviation';
    if (color === '#ffcc80') return 'Moderate Risk — Needs attention';
    if (color === '#ef9a9a') return 'High Risk — Improvement recommended';
    return 'Not monitored — No sensor data';
}

// ═══════════════════════════════════════════════════════════
// UI SECTION 17: Avatar Replay
// ═══════════════════════════════════════════════════════════

const AvatarReplay = {
    data: null,
    deviceType: null,
    viewMode: 'front',
    _threeCtx: null,
    currentIndex: 0,
    isPlaying: false,
    speed: 1,
    animFrame: null,
    lastTimestamp: null,
    simTime: 0,   // current playback time in ms (relative to data start)

    init(data, deviceType) {
        this.data = data;
        this.deviceType = (deviceType || 'arm').toLowerCase();
        this.viewMode = _getAvatarViewMode();
        this.currentIndex = 0;
        this.isPlaying = false;
        this.simTime = 0;
        this._render();
    },

    _render() {
        const stage = document.getElementById('avatarStage');
        if (!stage) return;
        this._drawFigure(stage);
    },

    _ensureReplay3D(stage) {
        if (!MiniAvatar3D.isSupported() || !stage) return null;
        const THREE = window.THREE;

        let canvas = stage.querySelector('#avatarReplayCanvas');
        if (!canvas) {
            canvas = document.createElement('canvas');
            canvas.id = 'avatarReplayCanvas';
            canvas.className = 'avatar-replay-canvas';
            stage.appendChild(canvas);
        }

        const rect = stage.getBoundingClientRect();
        const width = Math.max(220, Math.round((rect.width || 300) - 24));
        const height = Math.max(180, Math.round((rect.height || 220) - 24));

        if (!this._threeCtx || this._threeCtx.canvas !== canvas) {
            const scene = new THREE.Scene();
            const camera = new THREE.PerspectiveCamera(40, width / height, 0.05, 40);
            const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
            renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
            renderer.setClearColor(0x000000, 0);

            scene.add(new THREE.AmbientLight(0xffffff, 0.62));
            const sun = new THREE.DirectionalLight(0xfff8ee, 0.95);
            sun.position.set(2, 5, 3);
            scene.add(sun);
            const fill = new THREE.DirectionalLight(0x8898cc, 0.35);
            fill.position.set(-2, 2, -1);
            scene.add(fill);

            const mannequin = MiniAvatar3D._buildMannequin(scene, THREE);
            this._threeCtx = { canvas, scene, camera, renderer, mannequin };
        }

        const ctx = this._threeCtx;
        ctx.renderer.setSize(width, height, false);
        ctx.camera.aspect = width / height;
        ctx.camera.updateProjectionMatrix();
        canvas.width = width * Math.min(window.devicePixelRatio || 1, 2);
        canvas.height = height * Math.min(window.devicePixelRatio || 1, 2);
        return ctx;
    },

    _renderReplay3D(stage, angle, zone) {
        const ctx = this._ensureReplay3D(stage);
        if (!ctx) return false;

        const kind = (this.deviceType || 'trunk').toLowerCase();
        const rawAngle = Math.max(0, +angle || 0);
        const trunkDeg = kind === 'trunk' ? rawAngle : Math.min(18, rawAngle * 0.22);
        const armDeg = kind === 'arm' ? rawAngle : Math.max(8, rawAngle * 0.6);

        if (this.viewMode === 'side') {
            ctx.camera.position.set(1.45, 1.18, 2.25);
        } else {
            ctx.camera.position.set(0.02, 1.18, 2.95);
        }
        ctx.camera.lookAt(0, 0.72, 0);

        ctx.mannequin.reset();
        ctx.mannequin.setTrunkAngle(trunkDeg);
        ctx.mannequin.setArmAngle(armDeg, trunkDeg);
        ctx.mannequin.setTrunkZone(kind === 'trunk' ? zone : 'green');
        ctx.mannequin.setArmZone(kind === 'arm' ? zone : 'green');
        ctx.renderer.render(ctx.scene, ctx.camera);
        return true;
    },

    _drawFigure(stage) {
        const data = this.data;
        if (!data || data.length === 0) {
            stage.innerHTML = '<div class="gam-placeholder">No data</div>';
            return;
        }

        const idx   = this.currentIndex;
        const point = data[idx] || data[0];
        const angle = point.angle || 0;
        const zone  = point.zone  || 'green';
        const zoneColor = zone === 'green' ? '#4caf50' : (zone === 'yellow' ? '#ffc107' : '#f44336');

        // Update zone indicator
        const zoneIndicator = document.getElementById('avatarZoneIndicator');
        if (zoneIndicator) {
            zoneIndicator.style.background = zoneColor;
            zoneIndicator.title = zone;
        }

        const svg = document.getElementById('avatarSvg');
        const used3D = this._renderReplay3D(stage, angle, zone);

        if (svg) {
            if (used3D) {
                svg.style.display = 'none';
            } else {
                svg.style.display = '';
                if (this.deviceType === 'arm') {
                    this._drawArmFigure(svg, angle, zoneColor);
                } else {
                    this._drawTrunkFigure(svg, angle, zoneColor);
                }
            }
        }

        // Update angle display
        const angleDisplay = document.getElementById('avatarCurrentAngle');
        if (angleDisplay) {
            angleDisplay.innerHTML = `Current Angle: <strong>${angle.toFixed(1)}°</strong> · Zone: <strong style="color:${zoneColor}">${zone.toUpperCase()}</strong> · View: <strong>${this.viewMode.toUpperCase()}</strong>`;
        }

        // Update timeline
        const timeline = document.getElementById('avatarTimeline');
        if (timeline) {
            timeline.value = idx;
        }

        // Update time labels
        const timeLabel = document.getElementById('avatarCurrentTime');
        if (timeLabel) {
            const totalDuration = (data[data.length - 1].adjusted_elapsed_ms - data[0].adjusted_elapsed_ms) / 1000;
            const currentTime   = (point.adjusted_elapsed_ms - data[0].adjusted_elapsed_ms) / 1000;
            timeLabel.textContent = `${currentTime.toFixed(1)}s / ${totalDuration.toFixed(1)}s`;
        }
    },

    _drawArmFigure(svg, angleDeg, zoneColor) {
        svg.innerHTML = _composePostureViewerSvg(angleDeg, zoneColor, 'arm', false, this.viewMode);
    },

    _drawTrunkFigure(svg, angleDeg, zoneColor) {
        svg.innerHTML = _composePostureViewerSvg(angleDeg, zoneColor, 'trunk', false, this.viewMode);
    },

    play() {
        if (this.isPlaying) return;
        this.isPlaying = true;
        this.lastTimestamp = null;
        this._loop();
    },

    pause() {
        this.isPlaying = false;
        if (this.animFrame) cancelAnimationFrame(this.animFrame);
    },

    _loop() {
        if (!this.isPlaying) return;
        this.animFrame = requestAnimationFrame(ts => {
            if (!this.lastTimestamp) this.lastTimestamp = ts;
            const elapsed = (ts - this.lastTimestamp) * this.speed;
            this.lastTimestamp = ts;

            // Advance simulated time
            this.simTime += elapsed;

            // Find corresponding data index
            const data = this.data;
            if (!data || data.length === 0) return;
            const startMs = data[0].adjusted_elapsed_ms;
            const targetMs = startMs + this.simTime;

            // Binary search for index
            let i = this.currentIndex;
            while (i < data.length - 1 && data[i + 1].adjusted_elapsed_ms <= targetMs) i++;
            this.currentIndex = i;

            this._drawFigure(document.getElementById('avatarStage'));

            if (this.currentIndex >= data.length - 1) {
                this.pause();
                const btn = document.getElementById('avatarPlayPauseBtn');
                if (btn) btn.textContent = '▶';
                return;
            }
            this._loop();
        });
    },

    seekTo(index) {
        this.currentIndex = Math.max(0, Math.min(index, (this.data || []).length - 1));
        const data = this.data;
        if (data) {
            this.simTime = data[this.currentIndex].adjusted_elapsed_ms - data[0].adjusted_elapsed_ms;
        }
        this._drawFigure(document.getElementById('avatarStage'));
    },

    /** Seek to the data point closest to a given absolute timestamp (ms). */
    seekToMs(targetMs) {
        const data = this.data;
        if (!data || data.length === 0) return;
        let idx = 0;
        for (let i = 0; i < data.length - 1; i++) {
            if (data[i + 1].adjusted_elapsed_ms <= targetMs) idx = i + 1;
            else break;
        }
        this.seekTo(idx);
    }
};

function showAvatarReplayModal(data, deviceType) {
    const modal = document.getElementById('avatarReplayModal');
    if (!modal) return;

    modal.classList.remove('hidden');

    // Re-initialize replay
    AvatarReplay.data = data;
    AvatarReplay.deviceType = (deviceType || 'arm').toLowerCase();
    AvatarReplay.viewMode = _getAvatarViewMode();
    AvatarReplay.currentIndex = 0;
    AvatarReplay.simTime = 0;
    AvatarReplay.isPlaying = false;
    _syncAvatarViewButtons(modal);

    const timeline = document.getElementById('avatarTimeline');
    if (timeline && data) {
        timeline.max = data.length - 1;
        timeline.value = 0;
    }

    // Update time end label
    const timeEnd = document.getElementById('avatarTimeEnd');
    if (timeEnd && data && data.length > 0) {
        const dur = (data[data.length - 1].adjusted_elapsed_ms - data[0].adjusted_elapsed_ms) / 1000;
        timeEnd.textContent = `${dur.toFixed(1)}s`;
    }

    AvatarReplay._drawFigure(document.getElementById('avatarStage'));
}

// ═══════════════════════════════════════════════════════════
// SECTION 18: Integration – called by app.js hooks
// ═══════════════════════════════════════════════════════════

const GamificationSystem = {
    _initialized: false,
    _currentSession: null,

    async init() {
        try {
            await GamificationDB.init();

            // Load user's sessions
            window._gamSessions = await GamificationDB.getUserSessions(getUserId());

            // Refresh identity bar
            refreshIdentityBar();

            // Show mission card (if not dismissed today)
            const lastSession = window._gamSessions && window._gamSessions.length > 0
                ? window._gamSessions[0]
                : null;
            showMissionCardModal(false);

            // Render group panel
            renderGroupPanel();

            this._initialized = true;
            this._bindModalCloseButtons();
        } catch (e) {
            console.warn('GamificationSystem init error:', e);
        }
    },

    /**
     * Called by app.js renderReportAnalysis() after charts and stats are rendered.
     */
    async onReportLoaded(data, metadata, stats) {
        if (!data || data.length === 0) return;
        if (!metadata) return;

        try {
            // Store raw data for avatar replay segment jumps
            window._gamCurrentData       = data;
            window._gamCurrentDeviceType = (metadata.device_type || 'trunk').toLowerCase();

            // Build session summary
            const filename = window.reportData && window.reportData.filename ? window.reportData.filename : 'unknown';
            const summary  = buildSessionSummary(data, metadata, stats, filename);
            this._currentSession = summary;

            // Render new report sections
            renderRiskGauge('reportRiskGauge', summary.rulaScore, summary.riskLevel);
            renderSegmentComparison('reportSegmentComparison', summary.segments);
            renderBodyHeatmap('reportBodyHeatmap', summary);
            renderAnthropomorphicFeedback('reportAnthroFeedback', summary);

            // Fetch user's history (re-load) for comparison
            const sessions = await GamificationDB.getUserSessions(getUserId());

            // Include current session as "first" (newest)
            const allSessions = [summary, ...sessions];
            window._gamSessions = allSessions;

            const trends = TrendCalculator.computeTrends(allSessions);
            renderLongitudinalComparison('reportLongitudinal', summary, trends);

            // Teacher Analysis init
            TeacherAnalysis.init(data);

            // Save session to DB
            await GamificationDB.saveSession(summary);

            // If user is in a group, upload session stub to server
            const groupId = localStorage.getItem('wergonic_group_id');
            if (groupId) {
                GroupAPI.uploadSession(summary, groupId).catch(() => {});
            }

            // Refresh identity bar session count
            window._gamSessions = await GamificationDB.getUserSessions(getUserId());
            refreshIdentityBar();

        } catch (e) {
            console.warn('GamificationSystem.onReportLoaded error:', e);
        }
    },

    _bindModalCloseButtons() {
        // Progress Profile Modal
        const ppClose = document.getElementById('progressProfileModalClose');
        const ppModal = document.getElementById('progressProfileModal');
        if (ppClose && ppModal) {
            ppClose.addEventListener('click', () => ppModal.classList.add('hidden'));
        }
        const ppCloseFooter = document.getElementById('progressProfileCloseBtn');
        if (ppCloseFooter && ppModal) {
            ppCloseFooter.addEventListener('click', () => ppModal.classList.add('hidden'));
        }

        // Avatar Replay Modal
        const arClose = document.getElementById('avatarReplayModalClose');
        const arModal = document.getElementById('avatarReplayModal');
        if (arClose && arModal) {
            arClose.addEventListener('click', () => {
                AvatarReplay.pause();
                arModal.classList.add('hidden');
            });
        }
        const arCloseFooter = document.getElementById('avatarReplayCloseFooterBtn');
        if (arCloseFooter && arModal) {
            arCloseFooter.addEventListener('click', () => {
                AvatarReplay.pause();
                arModal.classList.add('hidden');
            });
        }

        // Progress Profile button in header
        const progressBtn = document.getElementById('openProgressProfileBtn');
        if (progressBtn) {
            progressBtn.addEventListener('click', () => {
                const sessions = window._gamSessions || [];
                showProgressProfileModal(sessions);
            });
        }

        // Avatar Replay button in report modal footer
        const avatarBtn = document.getElementById('openAvatarReplayBtn');
        if (avatarBtn) {
            avatarBtn.addEventListener('click', () => {
                if (!this._currentSession) return;
                const data = window.reportData && window.reportData.currentData;
                const meta = window.reportData && window.reportData.metadata;
                if (data) showAvatarReplayModal(data, meta && meta.device_type);
            });
        }

        // Avatar play/pause
        const playBtn = document.getElementById('avatarPlayPauseBtn');
        if (playBtn) {
            playBtn.addEventListener('click', () => {
                if (AvatarReplay.isPlaying) {
                    AvatarReplay.pause();
                    playBtn.textContent = '▶';
                } else {
                    AvatarReplay.play();
                    playBtn.textContent = '⏸';
                }
            });
        }

        // Avatar timeline scrub
        const avatarTimeline = document.getElementById('avatarTimeline');
        if (avatarTimeline) {
            avatarTimeline.addEventListener('input', () => {
                AvatarReplay.pause();
                const playBtn2 = document.getElementById('avatarPlayPauseBtn');
                if (playBtn2) playBtn2.textContent = '▶';
                AvatarReplay.seekTo(parseInt(avatarTimeline.value));
            });
        }

        // Avatar speed buttons
        document.querySelectorAll('.avatar-speed-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.avatar-speed-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                AvatarReplay.speed = parseFloat(btn.dataset.speed || '1');
            });
        });

        // Avatar view buttons
        document.querySelectorAll('.avatar-view-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const mode = (btn.dataset.view || 'front').toLowerCase();
                _setAvatarViewMode(mode);
                AvatarReplay.viewMode = _getAvatarViewMode();
                _syncAvatarViewButtons(document);
                AvatarReplay._drawFigure(document.getElementById('avatarStage'));
            });
        });

        // Teacher region buttons
        const teacherBtnA = document.getElementById('teacherRegionBtnA');
        const teacherBtnB = document.getElementById('teacherRegionBtnB');
        if (teacherBtnA) {
            teacherBtnA.addEventListener('click', () => {
                TeacherAnalysis.activeRegion = 'A';
                TeacherAnalysis._updateRegionButtons();
            });
        }
        if (teacherBtnB) {
            teacherBtnB.addEventListener('click', () => {
                TeacherAnalysis.activeRegion = 'B';
                TeacherAnalysis._updateRegionButtons();
            });
        }

        // Collapsible sections
        document.querySelectorAll('.collapsible-header').forEach(header => {
            header.addEventListener('click', () => {
                const body   = header.nextElementSibling;
                const toggle = header.querySelector('.collapsible-toggle');
                if (!body) return;
                body.classList.toggle('collapsed');
                if (toggle) toggle.classList.toggle('open', !body.classList.contains('collapsed'));
            });
        });
    }
};

// ═══════════════════════════════════════════════════════════
// SECTION 19: Utility Functions
// ═══════════════════════════════════════════════════════════

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function formatMs(ms) {
    if (ms === null || ms === undefined) return '--';
    const secs = Math.round(ms / 1000);
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function formatDuration(seconds) {
    if (!seconds) return '0s';
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

// ═══════════════════════════════════════════════════════════
// Expose to window
// ═══════════════════════════════════════════════════════════

window.GamificationSystem = GamificationSystem;
window.TeacherAnalysis    = TeacherAnalysis;
window.AvatarReplay       = AvatarReplay;
window.showProgressProfileModal = showProgressProfileModal;
window.showMissionCardModal     = showMissionCardModal;
window.showAvatarReplayModal    = showAvatarReplayModal;
window.renderGroupPanel         = renderGroupPanel;
