/**
 * Wergonic Device Manager - Production Server
 *
 * Express server with password protection for the webapp.
 * Requires valid password to access the main application.
 */

const express = require('express');
const session = require('express-session');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const https = require('https');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ── Data directory setup ──────────────────────────────────────
const DATA_DIR      = path.join(__dirname, 'data');
const GROUPS_FILE   = path.join(DATA_DIR, 'groups.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
const GOALS_FILE    = path.join(DATA_DIR, 'goals.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(GROUPS_FILE))   fs.writeFileSync(GROUPS_FILE,   JSON.stringify({ groups: [] }));
if (!fs.existsSync(SESSIONS_FILE)) fs.writeFileSync(SESSIONS_FILE, JSON.stringify({ sessions: [] }));
if (!fs.existsSync(GOALS_FILE))    fs.writeFileSync(GOALS_FILE,    JSON.stringify({ goals: [] }));

// Trust proxy for DigitalOcean (needed for secure cookies behind load balancer)
app.set('trust proxy', 1);

// Security headers (with adjustments for Web Bluetooth)
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            connectSrc: ["'self'", "blob:"],
            imgSrc: ["'self'", "data:", "blob:"],
        },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: false,
}));

// Parse form data
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'change-this-secret-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production', // HTTPS only in production
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        sameSite: 'lax'
    }
}));

// Rate limiting for login attempts
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts per window
    message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// HTTPS redirect in production (skip for localhost)
app.use((req, res, next) => {
    const isLocalhost = req.hostname === 'localhost' || req.hostname === '127.0.0.1';
    if (process.env.NODE_ENV === 'production' && !isLocalhost && !req.secure && req.get('x-forwarded-proto') !== 'https') {
        return res.redirect('https://' + req.get('host') + req.url);
    }
    next();
});

// Dev CORS: allow the Python dev server (port 8000) to call Express (port 3000).
// Credentials are included so express-session cookies work cross-origin.
app.use((req, res, next) => {
    const devOrigins = ['http://localhost:8000', 'http://127.0.0.1:8000'];
    const origin = req.headers.origin;
    if (devOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
});

// Authentication middleware
// API routes served cross-origin from a local dev server (e.g. python -m http.server 8000)
// cannot send session cookies due to browser sameSite restrictions.  We bypass auth for
// those requests so group features work during local development.
// Static file serving still requires auth in all cases.
const DEV_ORIGINS = ['http://localhost:8000', 'http://127.0.0.1:8000'];

const requireAuth = (req, res, next) => {
    // No password configured → full dev bypass
    if (!process.env.APP_PASSWORD_HASH) return next();
    // Cross-origin request from a local dev HTTP server → let API calls through
    if (DEV_ORIGINS.includes(req.headers.origin) && req.path.startsWith('/api/')) return next();
    // Normal session auth
    if (req.session && req.session.authenticated) return next();
    // API caller gets JSON 401 instead of an HTML redirect
    if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Not authenticated' });
    res.redirect('/login');
};

// Serve login page (public)
app.get('/login', (req, res) => {
    if (req.session && req.session.authenticated) {
        return res.redirect('/');
    }
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Handle login POST
app.post('/login', loginLimiter, async (req, res) => {
    const { password } = req.body;
    const storedHash = process.env.APP_PASSWORD_HASH;

    if (!storedHash) {
        console.error('APP_PASSWORD_HASH not set in environment variables');
        return res.status(500).json({ error: 'Server configuration error' });
    }

    try {
        const match = await bcrypt.compare(password, storedHash);

        if (match) {
            req.session.authenticated = true;
            req.session.loginTime = new Date().toISOString();
            return res.json({ success: true, redirect: '/' });
        } else {
            return res.status(401).json({ error: 'Invalid password' });
        }
    } catch (error) {
        console.error('Login error:', error);
        return res.status(500).json({ error: 'Authentication error' });
    }
});

// Handle logout
app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout error:', err);
        }
        res.redirect('/login');
    });
});

// Check auth status (for AJAX)
app.get('/api/auth-status', (req, res) => {
    res.json({
        authenticated: !!(req.session && req.session.authenticated),
        loginTime: req.session?.loginTime || null
    });
});

// ── File-based data helpers ───────────────────────────────────
function readJSON(filePath) {
    try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
    catch { return null; }
}

function writeJSON(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ── Groups API ────────────────────────────────────────────────

// POST /api/groups – create a new group
app.post('/api/groups', requireAuth, (req, res) => {
    const { name, userId, displayName } = req.body;
    if (!name || !userId) return res.status(400).json({ error: 'name and userId required' });

    const db    = readJSON(GROUPS_FILE);
    const group = {
        groupId:   generateId(),
        name:      name.trim().slice(0, 60),
        memberIds: [userId],
        members:   [{ userId, displayName: displayName || userId }],
        createdAt: new Date().toISOString()
    };
    db.groups.push(group);
    writeJSON(GROUPS_FILE, db);
    res.json(group);
});

// GET /api/groups – list all groups (name + memberCount only)
app.get('/api/groups', requireAuth, (req, res) => {
    const db = readJSON(GROUPS_FILE);
    const list = (db.groups || []).map(g => ({
        groupId:  g.groupId,
        name:     g.name,
        memberIds: g.memberIds || []
    }));
    res.json(list);
});

// GET /api/groups/:id – get group detail
app.get('/api/groups/:id', requireAuth, (req, res) => {
    const db    = readJSON(GROUPS_FILE);
    const group = (db.groups || []).find(g => g.groupId === req.params.id);
    if (!group) return res.status(404).json({ error: 'Group not found' });
    res.json(group);
});

// POST /api/groups/:id/join – add member to group
app.post('/api/groups/:id/join', requireAuth, (req, res) => {
    const { userId, displayName } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });

    const db    = readJSON(GROUPS_FILE);
    const group = (db.groups || []).find(g => g.groupId === req.params.id);
    if (!group) return res.status(404).json({ error: 'Group not found' });

    if (!group.memberIds) group.memberIds = [];
    if (!group.members)   group.members   = [];

    if (!group.memberIds.includes(userId)) {
        group.memberIds.push(userId);
        group.members.push({ userId, displayName: displayName || userId });
        writeJSON(GROUPS_FILE, db);
    }
    res.json(group);
});

// POST /api/groups/:id/leave – remove member from group
app.post('/api/groups/:id/leave', requireAuth, (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });

    const db    = readJSON(GROUPS_FILE);
    const group = (db.groups || []).find(g => g.groupId === req.params.id);
    if (!group) return res.status(404).json({ error: 'Group not found' });

    group.memberIds = (group.memberIds || []).filter(id => id !== userId);
    group.members   = (group.members   || []).filter(m => m.userId !== userId);
    writeJSON(GROUPS_FILE, db);
    res.json({ success: true });
});

// DELETE /api/groups/:id – delete group
app.delete('/api/groups/:id', requireAuth, (req, res) => {
    const db = readJSON(GROUPS_FILE);
    db.groups = (db.groups || []).filter(g => g.groupId !== req.params.id);
    writeJSON(GROUPS_FILE, db);
    res.json({ success: true });
});

// GET /api/groups/:id/stats – compute group leaderboard (last 7 days avg RULA)
app.get('/api/groups/:id/stats', requireAuth, (req, res) => {
    const db    = readJSON(GROUPS_FILE);
    const group = (db.groups || []).find(g => g.groupId === req.params.id);
    if (!group) return res.status(404).json({ error: 'Group not found' });

    const sessionDb = readJSON(SESSIONS_FILE);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const members = (group.members || []).map(member => {
        const userSessions = (sessionDb.sessions || []).filter(s =>
            s.userId   === member.userId &&
            s.groupId  === group.groupId &&
            s.timestamp >= sevenDaysAgo
        );
        const avgRula = userSessions.length > 0
            ? userSessions.reduce((sum, s) => sum + (s.rulaScore || 0), 0) / userSessions.length
            : null;
        return { ...member, avgRula, sessionCount: userSessions.length };
    });

    // Sort by avgRula ascending (lower is better); nulls last
    members.sort((a, b) => {
        if (a.avgRula === null && b.avgRula === null) return 0;
        if (a.avgRula === null) return 1;
        if (b.avgRula === null) return -1;
        return a.avgRula - b.avgRula;
    });

    res.json({ ...group, members });
});

// ── Season System ─────────────────────────────────────────────

const SEASON_THEMES = [
    { name: 'Back Awareness',        description: 'Focus on reducing trunk forward bend',        deviceFocus: 'trunk', metricFocus: 'redPct'       },
    { name: 'Arm Precision',          description: 'Keep your arm close and controlled',           deviceFocus: 'arm',   metricFocus: 'redPct'       },
    { name: 'Recovery Sprint',        description: 'Improve how quickly you return to good posture', deviceFocus: 'both',  metricFocus: 'recoveryTime' },
    { name: 'Consistency Challenge',  description: 'Complete a session every training day',        deviceFocus: 'both',  metricFocus: 'sessionCount' },
    { name: 'Total Wellness',         description: 'Reduce overall posture risk this fortnight',   deviceFocus: 'both',  metricFocus: 'rulaScore'    },
];

const SEASON_EPOCH = new Date('2026-01-01T00:00:00Z');

function getCurrentSeason() {
    const now = new Date();
    const msSinceEpoch = now - SEASON_EPOCH;
    const seasonLen = 14 * 24 * 60 * 60 * 1000; // 14 days in ms
    const seasonIndex = Math.floor(msSinceEpoch / seasonLen);
    const theme = SEASON_THEMES[((seasonIndex % SEASON_THEMES.length) + SEASON_THEMES.length) % SEASON_THEMES.length];
    const startDate = new Date(SEASON_EPOCH.getTime() + seasonIndex * seasonLen);
    const endDate   = new Date(startDate.getTime() + seasonLen);
    const daysRemaining = Math.max(0, Math.ceil((endDate - now) / (24 * 60 * 60 * 1000)));
    return { seasonNumber: seasonIndex + 1, ...theme, startDate: startDate.toISOString(), endDate: endDate.toISOString(), daysRemaining };
}

// GET /api/seasons/current
app.get('/api/seasons/current', requireAuth, (req, res) => {
    res.json(getCurrentSeason());
});

// ── Goals API ─────────────────────────────────────────────────

// POST /api/groups/:id/goals – create or replace group goal for current season
app.post('/api/groups/:id/goals', requireAuth, (req, res) => {
    const { type, target, description } = req.body;
    if (!type || target === undefined) return res.status(400).json({ error: 'type and target required' });

    const season = getCurrentSeason();
    const db = readJSON(GOALS_FILE) || { goals: [] };
    // One active goal per group per season
    db.goals = (db.goals || []).filter(g => !(g.groupId === req.params.id && g.seasonNumber === season.seasonNumber));
    const goal = {
        id:           generateId(),
        groupId:      req.params.id,
        type,                               // 'reduce_risk' | 'session_count'
        target:       parseFloat(target),
        description:  (description || '').slice(0, 100),
        createdAt:    new Date().toISOString(),
        seasonNumber: season.seasonNumber
    };
    db.goals.push(goal);
    writeJSON(GOALS_FILE, db);
    res.json(goal);
});

// GET /api/groups/:id/goals – get current season goal + computed progress
app.get('/api/groups/:id/goals', requireAuth, (req, res) => {
    const groupsDb = readJSON(GROUPS_FILE);
    const group    = (groupsDb.groups || []).find(g => g.groupId === req.params.id);
    if (!group) return res.status(404).json({ error: 'Group not found' });

    const season     = getCurrentSeason();
    const goalsDb    = readJSON(GOALS_FILE) || { goals: [] };
    const sessionDb  = readJSON(SESSIONS_FILE);

    const goal = (goalsDb.goals || []).find(g => g.groupId === req.params.id && g.seasonNumber === season.seasonNumber);
    if (!goal) return res.json({ goal: null, season });

    const memberIds      = group.memberIds || [];
    const seasonSessions = (sessionDb.sessions || []).filter(s =>
        s.groupId  === req.params.id &&
        s.timestamp >= season.startDate &&
        s.timestamp <= season.endDate
    );

    let progress = {}, progressPct = 0;

    if (goal.type === 'reduce_risk') {
        const avgRula = seasonSessions.length > 0
            ? seasonSessions.reduce((sum, s) => sum + (s.rulaScore || 0), 0) / seasonSessions.length
            : null;
        // progressPct = how close avg RULA is to the target ceiling
        progressPct = avgRula !== null && goal.target > 0
            ? Math.max(0, Math.min(100, Math.round((1 - avgRula / goal.target) * 100)))
            : 0;
        progress = { avgRula: avgRula !== null ? Math.round(avgRula * 10) / 10 : null, targetRula: goal.target };

    } else if (goal.type === 'session_count') {
        const membersReached = memberIds.filter(uid =>
            seasonSessions.filter(s => s.userId === uid).length >= goal.target
        ).length;
        progressPct = memberIds.length > 0 ? Math.round((membersReached / memberIds.length) * 100) : 0;
        progress = { membersReached, totalMembers: memberIds.length, targetSessions: goal.target };
    }

    res.json({ goal, progress, progressPct, season });
});

// ── Inter-group Leaderboard API ───────────────────────────────

// GET /api/leaderboard – group-level average RULA for current season (no individual data)
app.get('/api/leaderboard', requireAuth, (req, res) => {
    const groupsDb   = readJSON(GROUPS_FILE);
    const sessionDb  = readJSON(SESSIONS_FILE);
    const season     = getCurrentSeason();

    const leaderboard = (groupsDb.groups || []).map(group => {
        const groupSessions = (sessionDb.sessions || []).filter(s =>
            s.groupId  === group.groupId &&
            s.timestamp >= season.startDate
        );
        const avgRula = groupSessions.length > 0
            ? Math.round(groupSessions.reduce((sum, s) => sum + (s.rulaScore || 0), 0) / groupSessions.length * 10) / 10
            : null;
        return {
            groupId:       group.groupId,
            name:          group.name,
            memberCount:   (group.memberIds || []).length,
            avgRula,
            totalSessions: groupSessions.length
        };
    }).filter(g => g.avgRula !== null);

    leaderboard.sort((a, b) => a.avgRula - b.avgRula);
    res.json({ leaderboard, season });
});

// ── Sessions API ──────────────────────────────────────────────

// POST /api/sessions – upload a session summary stub
app.post('/api/sessions', requireAuth, (req, res) => {
    const { id, userId, groupId, rulaScore, riskLevel, greenPct, yellowPct, redPct,
            sessionDuration, vibrationCount, timestamp, filename, deviceType } = req.body;

    if (!userId) return res.status(400).json({ error: 'userId required' });

    const db = readJSON(SESSIONS_FILE);
    const session = {
        id:              id || generateId(),
        userId,
        groupId:         groupId || null,
        rulaScore:       rulaScore  || 0,
        riskLevel:       riskLevel  || 'unknown',
        greenPct:        greenPct   || 0,
        yellowPct:       yellowPct  || 0,
        redPct:          redPct     || 0,
        sessionDuration: sessionDuration || 0,
        vibrationCount:  vibrationCount  || 0,
        timestamp:       timestamp || new Date().toISOString(),
        filename:        filename  || '',
        deviceType:      deviceType || ''
    };

    // Avoid duplicates (upsert by id)
    const idx = db.sessions.findIndex(s => s.id === session.id);
    if (idx >= 0) db.sessions[idx] = session;
    else db.sessions.push(session);

    // Keep only last 10,000 sessions to prevent unbounded growth
    if (db.sessions.length > 10000) db.sessions = db.sessions.slice(-10000);

    writeJSON(SESSIONS_FILE, db);
    res.json(session);
});

// GET /api/sessions – query sessions by groupId or userId
app.get('/api/sessions', requireAuth, (req, res) => {
    const { groupId, userId } = req.query;
    const db = readJSON(SESSIONS_FILE);
    let result = db.sessions || [];
    if (groupId) result = result.filter(s => s.groupId === groupId);
    if (userId)  result = result.filter(s => s.userId  === userId);
    // Return newest first, limit 200
    result = result.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || '')).slice(0, 200);
    res.json(result);
});

// DELETE /api/sessions/:id – delete a session record
app.delete('/api/sessions/:id', requireAuth, (req, res) => {
    const db = readJSON(SESSIONS_FILE);
    db.sessions = (db.sessions || []).filter(s => s.id !== req.params.id);
    writeJSON(SESSIONS_FILE, db);
    res.json({ success: true });
});

// Serve protected static files
app.use('/', requireAuth, express.static(path.join(__dirname, 'protected')));

// Catch-all for protected routes
app.get('*', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'protected', 'index.html'));
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).send('Internal Server Error');
});

// Start HTTPS server
const options = {
    key: fs.readFileSync(path.join(__dirname, 'server.key')),
    cert: fs.readFileSync(path.join(__dirname, 'server.crt'))
};

https.createServer(options, app).listen(PORT, () => {
    console.log(`Wergonic Server running on port ${PORT} (HTTPS)`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Login at: https://192.168.31.47:${PORT}/login`);
});
