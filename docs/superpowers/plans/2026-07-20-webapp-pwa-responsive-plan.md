# Webapp Responsive/PWA/Theme/Version-Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship one shared `app-shell.js` that gives all 11 patient/clinician-facing pages a consistent responsive nav, a unified dark/light theme toggle, PWA installability, and a toast-based version-update check — replacing today's per-page copy-pasted (and frequently missing) nav and theme code.

**Architecture:** A single new `app-shell.js`, included via `<script src="app-shell.js">` in each page's `<head>` (synchronous, not deferred, so the theme class applies before first paint), owns three concerns: theme (one shared `localStorage` key, `:root.light` class convention already used by 3 of the pages), navigation (renders a desktop pill bar into a `#app-shell-nav` mount point and a fixed mobile bottom-tab-bar + "More" drawer, injecting its own scoped `<style>` block), and version-checking (polls a new `/version.json` route added to `server.js`, shows a dismissible reload toast, never auto-reloads). A new service worker (`sw.js`) caches the app shell only. Icons are generated from one hand-authored SVG monogram via `rsvg-convert`.

**Tech Stack:** Vanilla JS (ES5-compatible, no build step — matches the existing `app.js`/`config.js` style), plain CSS, Express (`server.js`, already present), `rsvg-convert` for icon rasterization (confirmed installed at `/opt/homebrew/bin/rsvg-convert`).

## Global Constraints

- No build step, no framework, no new npm dependencies. Match the existing vanilla-JS/inline-CSS style of the codebase.
- Every JS file change: verify with `node --check <file>`.
- Manual browser verification (Chrome DevTools device toolbar, desktop ~1440px and mobile ~390px widths) is the test harness for visual/interactive behavior — this codebase has no automated frontend test suite (established pattern from prior work on this branch).
- Theme convention: absence of the `light` class on `<html>` = dark (the site's existing default everywhere it's implemented); `<html class="light">` = light. One shared `localStorage` key: `wergonic-theme` (values `'light'` / `'dark'`). No stored value → follow `prefers-color-scheme`.
- Nav destinations (exactly these 7, unchanged from today's existing links, `teacher-control.html` and the `test-*.html` pages excluded per the approved spec): Home→`index.html`, Session Report→`demo-report.html`, Compare Reports→`compare-report.html`, Comparison→`demo.html`, Landscape Report→`session-comparison-landscape.html`, Posture Viewer→`posture-viewer.html`, Live Record→`live-record.html`.
- Mobile nav pattern (user-approved): bottom tab bar with Home / Sessions(→demo-report.html) / Compare(→compare-report.html) / Live(→live-record.html), plus a "More" tab opening a drawer with Comparison / Landscape Report / Posture Viewer.
- In-scope pages (11): `index.html`, `dashboard.html`, `upload.html`, `posture-viewer.html`, `live-record.html`, `clinician-dashboard.html`, `compare-report.html`, `session-comparison-landscape.html`, `rehab-game.html`, `demo.html`, `demo-report.html`. Out of scope: `teacher-control.html`, `test-button.html`, `test-report.html`, `test-syntax.html` — do not touch.
- `config.js`'s `APP_CONFIG.version` (currently `'3.0.7'`) stays the single source of truth for the app version — never hand-maintain a second version number.
- Never commit with `git add -A`/`git add .` — always explicit paths.
- Commit message footer (every commit):
  ```
  Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_017erP8GaUst5fUQNEEpecYg
  ```

## Per-page CSS reality (read before Tasks 9-11 — this is why they're split into three groups, not one)

Verified by reading each file — there is no single shared theme system today:

| Page | Theme system today | Treatment needed |
|---|---|---|
| `dashboard.html` | Own vars (`--bg-0` family), **already has working `:root.light`** + its own toggle (key `dashboard-theme`) | Rewire toggle to shared key only. No CSS change. No nav today (net new). |
| `upload.html` | Same `--bg-0` family, **already has `:root.light`** + own toggle (key `wergonic-upload-theme`) | Rewire toggle only. No CSS change. No nav today (net new). |
| `session-comparison-landscape.html` | Own `--dash-*` vars layered over `styles.css`, **already has `:root.light`** + own toggle (key `landscape-theme`) | Rewire toggle only. No CSS change. No nav today (net new). |
| `index.html`, `posture-viewer.html`, `live-record.html`, `demo-report.html` | Pure `styles.css` (M3 tokens), no local override, **no dark mode exists at all** | Fixed once, in `styles.css` (Task 8). Has old nav markup to remove. |
| `demo.html` | Local vars that `var()`-reference M3 tokens directly (e.g. `--surface: var(--md-sys-color-surface-container-low)`) | Inherits Task 8's fix automatically. Has old nav markup to remove. |
| `clinician-dashboard.html`, `rehab-game.html` | Own vars (`--bg`/`--bg1`/`--bg2`/`--cyan`/... family, identical between the two), **no light variant exists** | Needs a new `:root.light` block written for these var names (Task 11). No standard nav today. |
| `compare-report.html` | Own `--cmp-*` vars layered over `styles.css`, **no light variant exists** | Needs a new `:root.light` block for `--cmp-*` (Task 11). Has old nav markup to remove. |

## 1. File Structure

- Create: `icons/icon.svg` — hand-authored monogram source.
- Create: `icons/icon-192.png`, `icons/icon-512.png`, `icons/icon-maskable-512.png` — rasterized from the SVG.
- Create: `manifest.json` — PWA manifest.
- Create: `app-shell.js` — theme + nav + version-check + SW registration (built incrementally across Tasks 4-6).
- Create: `sw.js` — service worker, app-shell caching.
- Modify: `server.js` — add `GET /version.json`.
- Modify: `styles.css` — add dark-mode M3 tokens as the default `:root`, move today's (already-shipping) light values under `:root.light`; remove the now-dead `.navigation`/`.nav-link`/`.nav-version` rules (superseded by `app-shell.js`'s own nav CSS).
- Modify (CSS only, small additions): `clinician-dashboard.html`, `rehab-game.html`, `compare-report.html` — new `:root.light` blocks for their existing local variable names.
- Modify (wiring — script/manifest/icon tags, mount point, remove old nav/theme code): all 11 in-scope pages.

## 2. Icon monogram source

The single new visual asset (no logo exists anywhere in the repo — checked, including the two `.docx` guides). A rounded-square dark-blue background with a white "W", matching the existing `theme-color` (`#1a5fb4`) already present in several pages' `<meta>` tags.

---

### Task 1: PWA icon set

**Files:**
- Create: `icons/icon.svg`
- Create: `icons/icon-192.png`, `icons/icon-512.png`, `icons/icon-maskable-512.png`

**Interfaces:**
- Consumes: nothing.
- Produces: three PNG files at fixed paths, referenced by `manifest.json` (Task 2) and by `<link rel="icon">`/`<link rel="apple-touch-icon">` tags added to every page (Tasks 9-11).

- [ ] **Step 1: Write the SVG source**

Create `icons/icon.svg`:
```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#1a5fb4"/>
  <text x="256" y="326" font-family="Arial, Helvetica, sans-serif" font-size="280"
        font-weight="700" fill="#ffffff" text-anchor="middle">W</text>
</svg>
```

- [ ] **Step 2: Rasterize to the three required sizes**

Run (repo root):
```bash
mkdir -p icons
rsvg-convert -w 192 -h 192 icons/icon.svg -o icons/icon-192.png
rsvg-convert -w 512 -h 512 icons/icon.svg -o icons/icon-512.png
rsvg-convert -w 512 -h 512 icons/icon.svg -o icons/icon-maskable-512.png
```
Expected: exit 0, three PNG files created. Verify:
```bash
file icons/icon-192.png icons/icon-512.png icons/icon-maskable-512.png
```
Expected: each line reports `PNG image data, 192 x 192` or `512 x 512` respectively.

*(The maskable variant reuses the same flat-background art — the `rx="96"` rounded corners plus solid full-bleed background already satisfy the "safe zone" maskable-icon requirement, since there's no content near the edges that a platform mask would clip.)*

- [ ] **Step 3: Commit**

```bash
git add icons/icon.svg icons/icon-192.png icons/icon-512.png icons/icon-maskable-512.png
git commit -m "feat: add PWA icon set (monogram, 3 sizes)"
```
(with the footer from Global Constraints)

---

### Task 2: PWA manifest

**Files:**
- Create: `manifest.json`

**Interfaces:**
- Consumes: `icons/icon-192.png`, `icons/icon-512.png`, `icons/icon-maskable-512.png` (Task 1).
- Produces: `manifest.json` at repo root, referenced by `<link rel="manifest" href="manifest.json">` added to every in-scope page (Tasks 9-11).

- [ ] **Step 1: Write manifest.json**

Create `manifest.json`:
```json
{
  "name": "Wergonic Training",
  "short_name": "Wergonic",
  "start_url": "index.html",
  "scope": ".",
  "display": "standalone",
  "background_color": "#050e1d",
  "theme_color": "#1a5fb4",
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

- [ ] **Step 2: Validate it's well-formed JSON**

```bash
node -e "JSON.parse(require('fs').readFileSync('manifest.json', 'utf8')); console.log('valid')"
```
Expected: prints `valid`.

- [ ] **Step 3: Commit**

```bash
git add manifest.json
git commit -m "feat: add PWA manifest"
```
(with the footer from Global Constraints)

---

### Task 3: `/version.json` server route

**Files:**
- Modify: `server.js`

**Interfaces:**
- Consumes: `config.js`'s `const APP_CONFIG = { version: '3.0.7', ... }` (read as text, not required as a module — `config.js` is a browser script, not a Node module).
- Produces: `GET /version.json` → `{"version": "3.0.7"}` with `Cache-Control: no-store`. Consumed by `app-shell.js`'s version-check poll (Task 6).

Current `server.js` in full:
```js
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname)));

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

- [ ] **Step 1: Add the route**

Replace the full contents of `server.js` with:
```js
const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/version.json', (req, res) => {
  const configSource = fs.readFileSync(path.join(__dirname, 'config.js'), 'utf8');
  const match = configSource.match(/version:\s*'([^']+)'/);
  const version = match ? match[1] : 'unknown';
  res.set('Cache-Control', 'no-store');
  res.json({ version });
});

app.use(express.static(path.join(__dirname)));

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

- [ ] **Step 2: Verify syntax**

```bash
node --check server.js
```
Expected: no output, exit 0.

- [ ] **Step 3: Verify the route live**

```bash
node server.js &
sleep 1
curl -s http://localhost:3000/version.json
kill %1
```
Expected: `{"version":"3.0.7"}` (or whatever `config.js` currently holds).

- [ ] **Step 4: Commit**

```bash
git add server.js
git commit -m "feat: add /version.json route for update-check polling"
```
(with the footer from Global Constraints)

---

### Task 4: `app-shell.js` — theme engine

**Files:**
- Create: `app-shell.js`

**Interfaces:**
- Consumes: `localStorage` (browser API), `window.matchMedia`.
- Produces: `wergonicSetTheme(light: boolean): void` — applies/removes `.light` on `<html>` and persists to `localStorage['wergonic-theme']`. An IIFE that runs on script parse (before `DOMContentLoaded`) and applies the initial theme class. Both are consumed by Task 5 (the toggle button calls `wergonicSetTheme`).

- [ ] **Step 1: Write the theme engine**

Create `app-shell.js`:
```js
// Wergonic shared app shell: theme, navigation, version-check, service worker.
// Include via <script src="app-shell.js"></script> in <head>, NOT deferred/async,
// so the theme class is applied before first paint (no flash of wrong theme).

(function initTheme() {
    var stored = null;
    try { stored = localStorage.getItem('wergonic-theme'); } catch (e) {}
    var isLight = stored
        ? stored === 'light'
        : (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches);
    if (isLight) document.documentElement.classList.add('light');
})();

function wergonicSetTheme(light) {
    document.documentElement.classList.toggle('light', light);
    try { localStorage.setItem('wergonic-theme', light ? 'light' : 'dark'); } catch (e) {}
    var btn = document.getElementById('app-shell-theme-toggle');
    if (btn) btn.textContent = light ? '☀' : '☾';
}
```

- [ ] **Step 2: Verify syntax**

```bash
node --check app-shell.js
```
Expected: no output, exit 0.

- [ ] **Step 3: Manual verification**

Add `<script src="app-shell.js"></script>` temporarily to the `<head>` of any page (e.g. `index.html`, right after `config.js`), open it in Chrome, run in the DevTools console:
```js
wergonicSetTheme(true); document.documentElement.classList.contains('light')
```
Expected: `true`. Reload the page — `<html>` should still have `class="light"` (persisted). Run `wergonicSetTheme(false)` and reload again — should be dark. Remove the temporary `<script>` tag before committing (it gets added for real, correctly, in Tasks 9-11).

- [ ] **Step 4: Commit**

```bash
git add app-shell.js
git commit -m "feat: app-shell.js theme engine (init + toggle)"
```
(with the footer from Global Constraints)

---

### Task 5: `app-shell.js` — navigation (desktop pill bar + mobile tabs/drawer)

**Files:**
- Modify: `app-shell.js`

**Interfaces:**
- Consumes: `wergonicSetTheme` (Task 4), `window.APP_CONFIG.version` (from `config.js`, optional — falls back to empty string if `config.js` isn't loaded on a given page).
- Produces: renders into a required `<div id="app-shell-nav"></div>` mount point (desktop pill bar) and appends a fixed bottom tab bar + drawer directly to `<body>` (mobile, no mount point needed — `position: fixed`). Runs automatically on `DOMContentLoaded`. No public functions consumed by later tasks beyond what Task 6 adds to the same `DOMContentLoaded` listener.

- [ ] **Step 1: Add nav data, rendering, and injected CSS**

Append to `app-shell.js` (after the Task 4 content):
```js
var APP_SHELL_NAV_ITEMS = [
    { label: 'Home', href: 'index.html', group: 'primary' },
    { label: 'Session Report', href: 'demo-report.html', group: 'primary' },
    { label: 'Compare Reports', href: 'compare-report.html', group: 'primary' },
    { label: 'Comparison', href: 'demo.html', group: 'more' },
    { label: 'Landscape Report', href: 'session-comparison-landscape.html', group: 'more' },
    { label: 'Posture Viewer', href: 'posture-viewer.html', group: 'more' },
    { label: 'Live Record', href: 'live-record.html', group: 'primary' }
];

var APP_SHELL_TABS = [
    { label: 'Home', href: 'index.html', icon: '⌂' },
    { label: 'Sessions', href: 'demo-report.html', icon: '▤' },
    { label: 'Compare', href: 'compare-report.html', icon: '⇄' },
    { label: 'Live', href: 'live-record.html', icon: '●' }
];

var APP_SHELL_MORE_ITEMS = APP_SHELL_NAV_ITEMS.filter(function (i) { return i.group === 'more'; });

function wergonicCurrentPage() {
    return window.location.pathname.split('/').pop() || 'index.html';
}

function wergonicInjectStyles() {
    var style = document.createElement('style');
    style.textContent =
        '.app-shell-pillbar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 16px;margin:0 0 20px;background:rgba(10,20,35,0.9);border-bottom:1px solid rgba(255,255,255,0.08);flex-wrap:wrap;}' +
        ':root.light .app-shell-pillbar{background:rgba(255,255,255,0.9);border-bottom-color:rgba(0,40,100,0.12);}' +
        '.app-shell-pills{display:flex;gap:6px;flex-wrap:wrap;}' +
        '.app-shell-pill{padding:8px 16px;border-radius:999px;background:rgba(255,255,255,0.06);color:#cfe0f5;text-decoration:none;font-size:14px;white-space:nowrap;}' +
        ':root.light .app-shell-pill{background:rgba(0,40,100,0.06);color:#1a2a3a;}' +
        '.app-shell-pill-active{background:#1a5fb4;color:#fff;}' +
        '.app-shell-right{display:flex;align-items:center;gap:10px;}' +
        '.app-shell-version{font-size:12px;color:#8ba3c2;}' +
        '.app-shell-theme-toggle{background:none;border:1px solid rgba(255,255,255,0.25);border-radius:999px;color:inherit;width:32px;height:32px;font-size:16px;cursor:pointer;line-height:1;}' +
        '.app-shell-tabbar{display:none;}' +
        '.app-shell-drawer{display:none;}' +
        '@media (max-width: 768px){' +
        '  .app-shell-pillbar{display:none;}' +
        '  .app-shell-tabbar{display:flex;position:fixed;left:0;right:0;bottom:0;z-index:50;background:rgba(10,20,35,0.96);border-top:1px solid rgba(255,255,255,0.08);padding:6px 0 max(6px, env(safe-area-inset-bottom));}' +
        '  :root.light .app-shell-tabbar{background:rgba(255,255,255,0.96);border-top-color:rgba(0,40,100,0.12);}' +
        '  .app-shell-tab{flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;font-size:11px;color:#8ba3c2;text-decoration:none;background:none;border:none;padding:4px 2px;cursor:pointer;font-family:inherit;}' +
        '  .app-shell-tab-icon{font-size:18px;}' +
        '  .app-shell-tab-active{color:#4a9eff;}' +
        '  :root.light .app-shell-tab-active{color:#1a5fb4;}' +
        '  .app-shell-drawer{display:block;position:fixed;inset:0;z-index:60;background:rgba(2,10,18,0.6);}' +
        '  .app-shell-drawer[hidden]{display:none;}' +
        '  .app-shell-drawer-sheet{position:absolute;left:0;right:0;bottom:0;background:#0d1f30;border-radius:14px 14px 0 0;padding:12px;padding-bottom:76px;display:flex;flex-direction:column;gap:4px;}' +
        '  :root.light .app-shell-drawer-sheet{background:#fff;}' +
        '  .app-shell-drawer-link{padding:12px 14px;border-radius:8px;color:#e8f3ff;text-decoration:none;}' +
        '  :root.light .app-shell-drawer-link{color:#1a2a3a;}' +
        '  body{padding-bottom:64px;}' +
        '}';
    document.head.appendChild(style);
}

function wergonicRenderNav() {
    var mount = document.getElementById('app-shell-nav');
    if (!mount) {
        console.warn('app-shell.js: #app-shell-nav mount point not found on this page.');
        return;
    }
    var current = wergonicCurrentPage();
    var isLight = document.documentElement.classList.contains('light');

    mount.innerHTML =
        '<div class="app-shell-pillbar">' +
        '<div class="app-shell-pills">' +
        APP_SHELL_NAV_ITEMS.map(function (item) {
            var active = item.href === current ? ' app-shell-pill-active' : '';
            return '<a class="app-shell-pill' + active + '" href="' + item.href + '">' + item.label + '</a>';
        }).join('') +
        '</div>' +
        '<div class="app-shell-right">' +
        '<span class="app-shell-version">v' + (window.APP_CONFIG ? window.APP_CONFIG.version : '') + '</span>' +
        '<button type="button" id="app-shell-theme-toggle" class="app-shell-theme-toggle" aria-label="Toggle theme">' +
        (isLight ? '☀' : '☾') +
        '</button>' +
        '</div>' +
        '</div>';

    document.getElementById('app-shell-theme-toggle').addEventListener('click', function () {
        wergonicSetTheme(!document.documentElement.classList.contains('light'));
    });
}

function wergonicRenderMobileTabs() {
    var current = wergonicCurrentPage();
    var moreActive = APP_SHELL_MORE_ITEMS.some(function (i) { return i.href === current; });

    var bar = document.createElement('nav');
    bar.className = 'app-shell-tabbar';
    bar.innerHTML =
        APP_SHELL_TABS.map(function (t) {
            var active = t.href === current ? ' app-shell-tab-active' : '';
            return '<a class="app-shell-tab' + active + '" href="' + t.href + '">' +
                '<span class="app-shell-tab-icon">' + t.icon + '</span>' + t.label + '</a>';
        }).join('') +
        '<button type="button" id="app-shell-more-btn" class="app-shell-tab' + (moreActive ? ' app-shell-tab-active' : '') + '">' +
        '<span class="app-shell-tab-icon">⋯</span>More</button>';
    document.body.appendChild(bar);

    var drawer = document.createElement('div');
    drawer.id = 'app-shell-drawer';
    drawer.className = 'app-shell-drawer';
    drawer.hidden = true;
    drawer.innerHTML =
        '<div class="app-shell-drawer-sheet">' +
        APP_SHELL_MORE_ITEMS.map(function (item) {
            return '<a class="app-shell-drawer-link" href="' + item.href + '">' + item.label + '</a>';
        }).join('') +
        '</div>';
    document.body.appendChild(drawer);

    document.getElementById('app-shell-more-btn').addEventListener('click', function () {
        drawer.hidden = !drawer.hidden;
    });
    drawer.addEventListener('click', function (e) {
        if (e.target === drawer) drawer.hidden = true;
    });
}

document.addEventListener('DOMContentLoaded', function () {
    wergonicInjectStyles();
    wergonicRenderNav();
    wergonicRenderMobileTabs();
});
```

- [ ] **Step 2: Verify syntax**

```bash
node --check app-shell.js
```
Expected: no output, exit 0.

- [ ] **Step 3: Manual verification**

Temporarily add `<div id="app-shell-nav"></div>` right after `<body>` and `<script src="app-shell.js"></script>` in `<head>` on `index.html`. Open in Chrome:
- At desktop width: a pill nav bar renders with 7 items, the current page highlighted, a version badge, and a theme toggle button that flips the page between light/dark on click.
- Resize to ≤768px (or use DevTools device toolbar): the pill bar disappears, a bottom tab bar with Home/Sessions/Compare/Live appears, tapping "More" opens a drawer with the other 3 destinations, tapping outside the drawer sheet closes it.
- No console errors.
Remove the temporary markup/script tag before committing (added for real in Task 9).

- [ ] **Step 4: Commit**

```bash
git add app-shell.js
git commit -m "feat: app-shell.js responsive navigation (desktop pill bar + mobile tabs/drawer)"
```
(with the footer from Global Constraints)

---

### Task 6: `app-shell.js` — version-check toast + service worker registration

**Files:**
- Modify: `app-shell.js`

**Interfaces:**
- Consumes: `GET /version.json` (Task 3), `window.APP_CONFIG.version`, `navigator.serviceWorker` (registers `sw.js`, built in Task 7 — registration here is safe even before `sw.js` exists, since the fetch will simply 404 and the `.catch` swallows it, but Task 7 must land before this is meaningfully useful in production).
- Produces: nothing consumed by later tasks — this is the last piece of `app-shell.js`.

- [ ] **Step 1: Add version-check and SW registration**

Append to `app-shell.js` (after the Task 5 content, replacing the `DOMContentLoaded` listener at the bottom with the version below):
```js
function wergonicInitVersionCheck() {
    if (!window.APP_CONFIG) return;
    var current = window.APP_CONFIG.version;
    var toastShown = false;

    function showToast() {
        if (toastShown) return;
        toastShown = true;
        var toast = document.createElement('div');
        toast.className = 'app-shell-update-toast';
        toast.innerHTML =
            '<span>Update available</span>' +
            '<button type="button" id="app-shell-reload-btn">Reload</button>' +
            '<button type="button" id="app-shell-dismiss-btn" aria-label="Dismiss">✕</button>';
        document.body.appendChild(toast);
        document.getElementById('app-shell-reload-btn').addEventListener('click', function () {
            window.location.reload();
        });
        document.getElementById('app-shell-dismiss-btn').addEventListener('click', function () {
            toast.remove();
            toastShown = false;
        });
    }

    function check() {
        fetch('/version.json', { cache: 'no-store' })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (data) {
                if (data && data.version && data.version !== current) showToast();
            })
            .catch(function () {});
    }

    check();
    setInterval(check, 5 * 60 * 1000);
    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') check();
    });
}

function wergonicRegisterServiceWorker() {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', function () {
            navigator.serviceWorker.register('/sw.js').catch(function () {});
        });
    }
}

document.addEventListener('DOMContentLoaded', function () {
    wergonicInjectStyles();
    wergonicRenderNav();
    wergonicRenderMobileTabs();
    wergonicInitVersionCheck();
    wergonicRegisterServiceWorker();
});
```
(This replaces the shorter `DOMContentLoaded` listener from the end of Task 5 with the same four earlier calls plus the two new ones — delete the old listener block, don't leave two.)

Add the toast's CSS to `wergonicInjectStyles`'s `style.textContent` (insert before the final `}';` closing the mobile media-query string, i.e. append as its own top-level rule, not nested inside the `@media` block):
```js
        '.app-shell-update-toast{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:70;display:flex;align-items:center;gap:10px;background:#1a5fb4;color:#fff;padding:10px 16px;border-radius:999px;box-shadow:0 8px 24px rgba(0,0,0,0.35);font-size:14px;}' +
        '.app-shell-update-toast button{background:rgba(255,255,255,0.2);border:none;color:#fff;border-radius:999px;padding:4px 12px;cursor:pointer;font-size:13px;}' +
        '#app-shell-dismiss-btn{padding:4px 8px;}' +
```

- [ ] **Step 2: Verify syntax**

```bash
node --check app-shell.js
```
Expected: no output, exit 0.

- [ ] **Step 3: Manual verification**

With `server.js` running (`node server.js`) and `app-shell.js`/`#app-shell-nav` temporarily wired into `index.html` as in Task 5's Step 3: open the page, confirm no console errors and `GET /version.json` succeeds in the Network tab. In DevTools console, run:
```js
window.APP_CONFIG.version = '0.0.0';
```
then manually re-trigger a check by calling the poll (reload the page won't work since `APP_CONFIG.version` is reset by the reload — instead, temporarily edit `config.js`'s version string on disk to something else, refresh, confirm the toast appears within a few seconds; then revert `config.js`). Click "Reload" — page reloads. Click the dismiss button on a fresh toast trigger — toast disappears without reloading.

Remove any temporary wiring from `index.html` before committing.

- [ ] **Step 4: Commit**

```bash
git add app-shell.js
git commit -m "feat: app-shell.js version-check toast and service worker registration"
```
(with the footer from Global Constraints)

---

### Task 7: Service worker (`sw.js`)

**Files:**
- Create: `sw.js`

**Interfaces:**
- Consumes: nothing (standalone).
- Produces: registered by `app-shell.js` (Task 6) at `/sw.js`. Cache name embeds `config.js`'s version so a deploy invalidates the old cache — this file's `CACHE_NAME` constant must be bumped manually alongside `config.js`'s version at each release (documented in the README update, Task 12).

- [ ] **Step 1: Write the service worker**

Create `sw.js`:
```js
// App-shell-only cache: HTML/CSS/JS/icons for the 11 in-scope pages.
// No session/report data is cached — CSV/demo-data/BLE traffic always hits
// the network. Bump CACHE_NAME on each release alongside config.js's version.
const CACHE_NAME = 'wergonic-shell-v3.0.7';

const SHELL_FILES = [
    'index.html',
    'dashboard.html',
    'upload.html',
    'posture-viewer.html',
    'live-record.html',
    'clinician-dashboard.html',
    'compare-report.html',
    'session-comparison-landscape.html',
    'rehab-game.html',
    'demo.html',
    'demo-report.html',
    'app.js',
    'config.js',
    'app-shell.js',
    'styles.css',
    'gamification.css',
    'icons/icon-192.png',
    'icons/icon-512.png',
    'icons/icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((names) =>
            Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    const url = new URL(event.request.url);
    if (!SHELL_FILES.some((f) => url.pathname.endsWith('/' + f) || url.pathname === '/' + f)) {
        return; // not a shell file — network passthrough (data, BLE-adjacent fetches, etc.)
    }
    event.respondWith(
        caches.match(event.request).then((cached) => cached || fetch(event.request))
    );
});
```

- [ ] **Step 2: Verify syntax**

```bash
node --check sw.js
```
Expected: no output, exit 0.

- [ ] **Step 3: Manual verification**

With `app-shell.js` registering it (temporarily wired per Task 6) and `server.js` running, open `index.html` in Chrome, DevTools → Application → Service Workers: confirm it shows "activated and running". Application → Cache Storage: confirm a `wergonic-shell-v3.0.7` cache exists containing the shell files. Reload with DevTools Network tab set to "Offline": the page still loads (served from cache).

- [ ] **Step 4: Commit**

```bash
git add sw.js
git commit -m "feat: add service worker (app-shell caching only)"
```
(with the footer from Global Constraints)

---

### Task 8: `styles.css` — dark M3 theme + remove dead nav CSS

**Files:**
- Modify: `styles.css`

**Interfaces:**
- Consumes: nothing.
- Produces: `:root.light` becomes a real thing on every page that links `styles.css` (index, posture-viewer, live-record, compare-report, demo, demo-report — plus `demo.html`'s locally-derived vars inherit it automatically since they `var()`-reference these same M3 tokens).

Current `styles.css` `:root` block (lines 8-70, verified) holds the M3 tokens as today's only (light) palette. This task makes that block the **`:root.light` override** (values unchanged — this is exactly what ships today, just relocated) and writes a new **dark** `:root` as the default.

- [ ] **Step 1: Move today's tokens under `:root.light`, add a dark default**

In `styles.css`, replace:
```css
:root {
    /* M3 Color Tokens - Primary (Blue) */
    --md-sys-color-primary: #1a5fb4;
    --md-sys-color-on-primary: #ffffff;
    --md-sys-color-primary-container: #d4e3ff;
    --md-sys-color-on-primary-container: #001c3a;

    /* Secondary (Teal) */
    --md-sys-color-secondary: #006a67;
    --md-sys-color-on-secondary: #ffffff;
    --md-sys-color-secondary-container: #6ff7f1;
    --md-sys-color-on-secondary-container: #00201f;

    /* Tertiary (Orange/Warm) */
    --md-sys-color-tertiary: #9a4520;
    --md-sys-color-on-tertiary: #ffffff;
    --md-sys-color-tertiary-container: #ffdbc9;
    --md-sys-color-on-tertiary-container: #351000;

    /* Error */
    --md-sys-color-error: #ba1a1a;
    --md-sys-color-on-error: #ffffff;
    --md-sys-color-error-container: #ffdad6;
    --md-sys-color-on-error-container: #410002;

    /* Surface & Background */
    --md-sys-color-surface: #fdfcff;
    --md-sys-color-on-surface: #1a1c1e;
    --md-sys-color-surface-variant: #e0e2ec;
    --md-sys-color-on-surface-variant: #43474e;
    --md-sys-color-surface-container: #eeedf2;
    --md-sys-color-surface-container-low: #f4f3f7;
    --md-sys-color-surface-container-high: #e8e7ec;
    --md-sys-color-surface-container-highest: #e2e2e6;

    /* Outline */
    --md-sys-color-outline: #73777f;
    --md-sys-color-outline-variant: #c3c6cf;

    /* Status Colors */
    --md-sys-color-success: #006d3b;
    --md-sys-color-success-container: #98f7b5;
    --md-sys-color-warning: #7d5800;
    --md-sys-color-warning-container: #ffdf9e;

    /* Elevation (tonal) */
    --md-sys-elevation-1: 0 1px 3px 1px rgba(0,0,0,0.15), 0 1px 2px rgba(0,0,0,0.3);
    --md-sys-elevation-2: 0 2px 6px 2px rgba(0,0,0,0.15), 0 1px 2px rgba(0,0,0,0.3);
    --md-sys-elevation-3: 0 4px 8px 3px rgba(0,0,0,0.15), 0 1px 3px rgba(0,0,0,0.3);

    /* Shape - Expressive (more rounded) */
    --md-sys-shape-corner-none: 0;
    --md-sys-shape-corner-extra-small: 8px;
    --md-sys-shape-corner-small: 12px;
    --md-sys-shape-corner-medium: 16px;
    --md-sys-shape-corner-large: 24px;
    --md-sys-shape-corner-extra-large: 32px;
    --md-sys-shape-corner-full: 9999px;

    /* Typography scale */
    font-size: 18px;
}
```
with:
```css
:root {
    /* M3 Color Tokens - dark theme (default). Primary/secondary/tertiary
       tones lightened per M3 dark-theme guidance for contrast on dark
       surfaces; surfaces darkened; elevation shadows strengthened. */
    --md-sys-color-primary: #a8c8ff;
    --md-sys-color-on-primary: #00315f;
    --md-sys-color-primary-container: #1a5fb4;
    --md-sys-color-on-primary-container: #d4e3ff;

    --md-sys-color-secondary: #4dded9;
    --md-sys-color-on-secondary: #003735;
    --md-sys-color-secondary-container: #006a67;
    --md-sys-color-on-secondary-container: #6ff7f1;

    --md-sys-color-tertiary: #ffb68d;
    --md-sys-color-on-tertiary: #5a2000;
    --md-sys-color-tertiary-container: #9a4520;
    --md-sys-color-on-tertiary-container: #ffdbc9;

    --md-sys-color-error: #ffb4ab;
    --md-sys-color-on-error: #690005;
    --md-sys-color-error-container: #ba1a1a;
    --md-sys-color-on-error-container: #ffdad6;

    --md-sys-color-surface: #101418;
    --md-sys-color-on-surface: #e2e2e6;
    --md-sys-color-surface-variant: #43474e;
    --md-sys-color-on-surface-variant: #c3c6cf;
    --md-sys-color-surface-container: #1e2126;
    --md-sys-color-surface-container-low: #191c20;
    --md-sys-color-surface-container-high: #282b30;
    --md-sys-color-surface-container-highest: #33363b;

    --md-sys-color-outline: #8d9199;
    --md-sys-color-outline-variant: #43474e;

    --md-sys-color-success: #7fdb9c;
    --md-sys-color-success-container: #00522a;
    --md-sys-color-warning: #f0c04d;
    --md-sys-color-warning-container: #5c4200;

    --md-sys-elevation-1: 0 1px 3px 1px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.5);
    --md-sys-elevation-2: 0 2px 6px 2px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.5);
    --md-sys-elevation-3: 0 4px 8px 3px rgba(0,0,0,0.4), 0 1px 3px rgba(0,0,0,0.5);

    --md-sys-shape-corner-none: 0;
    --md-sys-shape-corner-extra-small: 8px;
    --md-sys-shape-corner-small: 12px;
    --md-sys-shape-corner-medium: 16px;
    --md-sys-shape-corner-large: 24px;
    --md-sys-shape-corner-extra-large: 32px;
    --md-sys-shape-corner-full: 9999px;

    font-size: 18px;
}

:root.light {
    /* M3 Color Tokens - light theme (today's original, unchanged values). */
    --md-sys-color-primary: #1a5fb4;
    --md-sys-color-on-primary: #ffffff;
    --md-sys-color-primary-container: #d4e3ff;
    --md-sys-color-on-primary-container: #001c3a;

    --md-sys-color-secondary: #006a67;
    --md-sys-color-on-secondary: #ffffff;
    --md-sys-color-secondary-container: #6ff7f1;
    --md-sys-color-on-secondary-container: #00201f;

    --md-sys-color-tertiary: #9a4520;
    --md-sys-color-on-tertiary: #ffffff;
    --md-sys-color-tertiary-container: #ffdbc9;
    --md-sys-color-on-tertiary-container: #351000;

    --md-sys-color-error: #ba1a1a;
    --md-sys-color-on-error: #ffffff;
    --md-sys-color-error-container: #ffdad6;
    --md-sys-color-on-error-container: #410002;

    --md-sys-color-surface: #fdfcff;
    --md-sys-color-on-surface: #1a1c1e;
    --md-sys-color-surface-variant: #e0e2ec;
    --md-sys-color-on-surface-variant: #43474e;
    --md-sys-color-surface-container: #eeedf2;
    --md-sys-color-surface-container-low: #f4f3f7;
    --md-sys-color-surface-container-high: #e8e7ec;
    --md-sys-color-surface-container-highest: #e2e2e6;

    --md-sys-color-outline: #73777f;
    --md-sys-color-outline-variant: #c3c6cf;

    --md-sys-color-success: #006d3b;
    --md-sys-color-success-container: #98f7b5;
    --md-sys-color-warning: #7d5800;
    --md-sys-color-warning-container: #ffdf9e;
}
```

- [ ] **Step 2: Remove the now-dead nav CSS**

In `styles.css`, delete the `.navigation`, `.nav-link`, `.nav-link:hover`, `.nav-link.active`, and `.nav-version` rules (the block currently at lines 191-232, ending right before the `@media (max-width: 640px)` block that follows `.nav-version`). Read the file first to confirm the exact current line range before deleting — other rules may have shifted after Step 1's edit. Do not remove the `@media (max-width: 640px)` block itself unless everything inside it only targeted the now-deleted nav classes (check its contents first; if it also styles other things, keep it and remove only the nav-specific rules inside it).

- [ ] **Step 3: Manual verification**

Open `index.html` in Chrome (no theme class on `<html>` yet — default state). Confirm the page now renders with a dark background (previously it was light) — this is the intended new default. Manually add `class="light"` to the `<html>` tag via DevTools and confirm it renders in the original light appearance, matching what the page looked like before this task (visually compare against a screenshot taken before this change, or against `git show HEAD~1:index.html` rendered in a second tab, if in doubt).

- [ ] **Step 4: Commit**

```bash
git add styles.css
git commit -m "feat: add dark M3 theme (new default); remove dead nav CSS"
```
(with the footer from Global Constraints)

---

### Task 9: Wire Group A — pages with already-complete theme CSS (`dashboard.html`, `upload.html`, `session-comparison-landscape.html`)

**Files:**
- Modify: `dashboard.html`, `upload.html`, `session-comparison-landscape.html`

**Interfaces:**
- Consumes: `app-shell.js` (Tasks 4-6), `manifest.json` (Task 2), `icons/*` (Task 1).
- Produces: nothing consumed by later tasks.

These three pages already have correct, complete `:root`/`:root.light` CSS and a working (but independently-keyed) toggle button. This task removes each page's own toggle wiring and lets `app-shell.js` own it via the shared `wergonic-theme` key, and adds the nav mount point (none of these three have a nav today).

- [ ] **Step 1: `dashboard.html` — head tags**

In `dashboard.html`, replace:
```html
    <script src="config.js"></script>
```
with:
```html
    <script src="config.js"></script>
    <script src="app-shell.js"></script>
    <link rel="manifest" href="manifest.json">
    <link rel="icon" href="icons/icon-192.png">
    <link rel="apple-touch-icon" href="icons/icon-192.png">
```

- [ ] **Step 2: `dashboard.html` — nav mount point**

Find the page's `<body>` tag and insert `<div id="app-shell-nav"></div>` as the first thing inside it (immediately after the opening `<body>` tag, before any existing content).

- [ ] **Step 3: `dashboard.html` — remove the old theme toggle button and JS**

Remove the button (currently `<button type="button" class="theme-toggle" id="themeToggle" aria-label="Toggle theme">☾</button>`) from the markup.

Remove the old toggle JS (currently, inside a `<script>` block):
```js
            const themeBtn = document.getElementById('themeToggle');
            if (localStorage.getItem('dashboard-theme') === 'light') {
                document.documentElement.classList.add('light');
                themeBtn.textContent = '☀';
            }
            themeBtn.addEventListener('click', () => {
                ...
            });
```
Delete the whole block (find its exact extent by reading the surrounding `<script>` — it starts at the `const themeBtn = ...` line and ends at the closing of the `addEventListener` callback). Leave everything else in that `<script>` block untouched.

*(The page's `.theme-toggle` CSS rules — `:root.light .theme-toggle` etc. at the lines found near 896-924 — can stay; they're now unused by markup but harmless dead CSS, not worth a risky removal in this pass since they're interleaved with other rules in a large inline stylesheet. Optional cleanup, not required.)*

- [ ] **Step 4: Repeat for `upload.html`**

Same four edits: add `<script src="app-shell.js"></script>` + manifest + icon links after `config.js` (if `upload.html` doesn't include `config.js`, add `app-shell.js` right after the `<title>` tag instead — verify by reading the file first); add `<div id="app-shell-nav"></div>` as the first child of `<body>`; remove the `<button class="theme-toggle" id="themeToggle">` markup; remove the old toggle JS block (the IIFE using `localStorage` key `'wergonic-upload-theme'`, found via `const KEY = 'wergonic-upload-theme';`).

- [ ] **Step 5: Repeat for `session-comparison-landscape.html`**

Same edits: add `app-shell.js` + manifest + icon links (this page already links `config.js`, `mission-cards-data.js`, `gamification.js` — add `app-shell.js` alongside those, after `config.js`); add `<div id="app-shell-nav"></div>` as the first child of `<body>`; remove the `<button id="themeToggle">` markup; remove the old toggle JS (the IIFE using `STORAGE_KEY = 'landscape-theme'`, with the comment `// Theme toggle (mirrors dashboard.html)`).

- [ ] **Step 6: Manual verification**

Start the server (`node server.js`) and open each of the three pages in Chrome:
- Nav pill bar renders at desktop width with the correct page highlighted; theme toggle works and persists on reload.
- Resize to mobile width: bottom tab bar + drawer work as in Task 5's verification.
- Toggling theme on `dashboard.html` and then loading `upload.html` shows the SAME theme (proves the shared key works) — this is new behavior (previously independent per page).
- No console errors, no duplicate/orphaned theme-toggle buttons visible.

- [ ] **Step 7: Commit**

```bash
git add dashboard.html upload.html session-comparison-landscape.html
git commit -m "feat: wire app-shell.js into dashboard/upload/landscape pages (shared theme + nav)"
```
(with the footer from Global Constraints)

---

### Task 10: Wire Group B — pure/derived M3 pages (`index.html`, `posture-viewer.html`, `live-record.html`, `demo.html`, `demo-report.html`)

**Files:**
- Modify: `index.html`, `posture-viewer.html`, `live-record.html`, `demo.html`, `demo-report.html`

**Interfaces:**
- Consumes: `app-shell.js` (Tasks 4-6), `manifest.json` (Task 2), `icons/*` (Task 1), Task 8's `styles.css` dark theme (no page-local CSS needed — inherited).
- Produces: nothing consumed by later tasks.

These five pages have old `<nav class="navigation">...</nav>` markup (with `.nav-link` children) to remove — `styles.css`'s now-deleted `.navigation`/`.nav-link` rules (Task 8) mean this markup would render unstyled if left in place, so removal is required, not optional.

- [ ] **Step 1: `index.html` — head tags**

Replace:
```html
    <script src="config.js"></script>
</head>
```
with:
```html
    <script src="config.js"></script>
    <script src="app-shell.js"></script>
    <link rel="manifest" href="manifest.json">
    <link rel="icon" href="icons/icon-192.png">
    <link rel="apple-touch-icon" href="icons/icon-192.png">
</head>
```

- [ ] **Step 2: `index.html` — replace old nav with mount point**

Find the existing nav block:
```html
                <a href="index.html" class="nav-link active">Home</a>
                <a href="demo-report.html" class="nav-link">Session Report</a>
                <a href="compare-report.html" class="nav-link">Compare Reports</a>
                <a href="demo.html" class="nav-link">Comparison</a>
                <a href="session-comparison-landscape.html" class="nav-link">Landscape Report</a>
                <a href="posture-viewer.html" class="nav-link">Posture Viewer</a>
                <a href="teacher-control.html" class="nav-link">Teacher Control</a>
                <a href="live-record.html" class="nav-link">Live Record</a>
```
Read the file to find this block's exact enclosing element (likely a `<nav class="navigation">` or similar wrapper — remove the WHOLE wrapper element, not just the inner links) and replace the entire wrapper with:
```html
    <div id="app-shell-nav"></div>
```
Place it as the first element inside `<body>` if the old nav wasn't already positioned there.

- [ ] **Step 3: Repeat Steps 1-2 for `posture-viewer.html`**

Same head-tag insertion (after `config.js` if present, else after `<title>` — this page has no `config.js` include per the earlier file read, so add `app-shell.js` + manifest + icon links right after the `<link rel="stylesheet" href="styles.css">` line, before the `<script type="importmap">` block). Same nav-block replacement (its nav has "Posture Viewer" marked `active` instead of "Home" — same 8-link structure otherwise, including the Teacher Control link to remove along with the rest of the wrapper).

- [ ] **Step 4: Repeat for `live-record.html`**

Same head-tag insertion (after `config.js`). This page's nav block is missing the "Landscape Report" link (6 items, not 8) — remove the whole wrapper regardless of which subset of links it contains; `app-shell.js` renders the full, correct, consistent 7-item set for every page.

- [ ] **Step 5: Repeat for `demo.html`**

Add `app-shell.js` + manifest + icon links after the existing `<link rel="stylesheet" href="styles.css">` line (this page has no `config.js` — check by reading the file; if absent, `app-shell.js`'s `window.APP_CONFIG` references in the version badge/toast simply degrade to an empty version string, which is acceptable). Remove its 8-item nav wrapper, add the mount div.

- [ ] **Step 6: Repeat for `demo-report.html`**

This page has no `config.js` either (confirmed by the earlier file read — only `styles.css` and a Chart.js CDN script). Add `app-shell.js` + manifest + icon links after `styles.css`. Remove its 8-item nav wrapper, add the mount div.

- [ ] **Step 7: Manual verification**

Open all five pages in Chrome: dark theme is now the default (Task 8's new default `:root`, no light class applied), nav pill bar renders correctly with the right active item, mobile breakpoint works, no leftover unstyled `.nav-link` elements anywhere, no console errors about missing `#app-shell-nav` mount points.

- [ ] **Step 8: Commit**

```bash
git add index.html posture-viewer.html live-record.html demo.html demo-report.html
git commit -m "feat: wire app-shell.js into M3 pages, remove old nav markup"
```
(with the footer from Global Constraints)

---

### Task 11: Wire Group C — pages needing a new `:root.light` block (`clinician-dashboard.html`, `rehab-game.html`, `compare-report.html`)

**Files:**
- Modify: `clinician-dashboard.html`, `rehab-game.html`, `compare-report.html`

**Interfaces:**
- Consumes: `app-shell.js` (Tasks 4-6), `manifest.json` (Task 2), `icons/*` (Task 1).
- Produces: nothing consumed by later tasks.

`clinician-dashboard.html` and `rehab-game.html` share an identical `:root` block (`--bg`/`--bg1`/`--bg2`/`--cyan`/`--purple`/`--green`/`--orange`/`--red`/`--text`/`--text2`/`--border`/`--gc`/`--gp`/`--gg`) with no light variant. `compare-report.html` has its own `--cmp-*` block, also with no light variant.

- [ ] **Step 1: `clinician-dashboard.html` — add `:root.light`**

The current block:
```css
  :root {
      --bg:      #070c18;
      --bg1:     #0d1628;
      --bg2:     #131e38;
      --cyan:    #22d3ee;
      --purple:  #a78bfa;
      --green:   #34d399;
      --orange:  #fbbf24;
      --red:     #f87171;
      --text:    #f1f5f9;
      --text2:   #8898b8;
      --border:  rgba(255,255,255,0.07);
      --gc:      rgba(34,211,238,0.25);
      --gp:      rgba(167,139,250,0.25);
      --gg:      rgba(52,211,153,0.25);
  }
```
Add immediately after it:
```css
  :root.light {
      --bg:      #eef2f8;
      --bg1:     #e4eaf2;
      --bg2:     #d9e1ee;
      --cyan:    #0891b2;
      --purple:  #7c3aed;
      --green:   #16a34a;
      --orange:  #d97706;
      --red:     #dc2626;
      --text:    #1a2a3a;
      --text2:   #4a5a6a;
      --border:  rgba(0,40,100,0.12);
      --gc:      rgba(8,145,178,0.15);
      --gp:      rgba(124,58,237,0.15);
      --gg:      rgba(22,163,74,0.15);
  }
```

- [ ] **Step 2: `clinician-dashboard.html` — head tags and nav mount**

Add after `<title>RehabGame · Clinician Dashboard</title>`:
```html
  <script src="config.js"></script>
  <script src="app-shell.js"></script>
  <link rel="manifest" href="manifest.json">
  <link rel="icon" href="icons/icon-192.png">
  <link rel="apple-touch-icon" href="icons/icon-192.png">
```
(This page has no `config.js` today — add it so the version badge/update-check work; verify by reading the file that there's no duplicate include already present.)

Add `<div id="app-shell-nav"></div>` as the first element inside `<body>`. This page has no standard nav today (only a "▶ Patient View" button linking to `rehab-game.html`) — leave that button exactly where it is; it's a page-specific action, not part of the shared nav, and is unaffected by this task.

- [ ] **Step 3: Repeat Steps 1-2 for `rehab-game.html`**

Identical `:root.light` block addition (same source `:root` values, confirmed identical between the two files). Same head-tag and nav-mount additions.

- [ ] **Step 4: `compare-report.html` — add `:root.light`**

The current block:
```css
        :root {
            --cmp-bg: #07131f;
            --cmp-bg-2: #0d1f30;
            --cmp-surface: rgba(12, 24, 38, 0.86);
            --cmp-surface-2: rgba(17, 29, 46, 0.9);
            --cmp-border: rgba(255, 255, 255, 0.08);
            --cmp-text: #f5f8ff;
            --cmp-muted: rgba(233, 240, 255, 0.7);
            --cmp-good: #4caf50;
            --cmp-warning: #ffc107;
            --cmp-risk: #f44336;
        }
```
Add immediately after it:
```css
        :root.light {
            --cmp-bg: #eef2f8;
            --cmp-bg-2: #e4eaf2;
            --cmp-surface: rgba(255, 255, 255, 0.92);
            --cmp-surface-2: rgba(245, 248, 252, 0.9);
            --cmp-border: rgba(0, 40, 100, 0.12);
            --cmp-text: #1a2a3a;
            --cmp-muted: rgba(26, 42, 58, 0.55);
            --cmp-good: #22a84a;
            --cmp-warning: #d4a00a;
            --cmp-risk: #e03830;
        }
```

- [ ] **Step 5: `compare-report.html` — head tags and nav**

Replace:
```html
    <script src="config.js"></script>
```
with:
```html
    <script src="config.js"></script>
    <script src="app-shell.js"></script>
    <link rel="manifest" href="manifest.json">
    <link rel="icon" href="icons/icon-192.png">
    <link rel="apple-touch-icon" href="icons/icon-192.png">
```
Remove this page's existing `.nav-link`/`.navigation`-based nav block (it has 6 items per the earlier grep, ending in "Teacher Control") and replace the whole wrapper with `<div id="app-shell-nav"></div>` as the first element inside `<body>`.

- [ ] **Step 6: Manual verification**

Open all three pages in Chrome: default dark palette renders correctly (matches each page's existing look — unchanged, since default `:root` values weren't touched, only added to); toggling to light via the new nav's toggle button correctly re-colors each page's own `--bg`/`--cmp-*` components (charts, cards, etc.) using the new `:root.light` values; nav renders and works identically to the other pages; `clinician-dashboard.html`'s "Patient View" button still works and still links to `rehab-game.html`.

- [ ] **Step 7: Commit**

```bash
git add clinician-dashboard.html rehab-game.html compare-report.html
git commit -m "feat: add light theme + app-shell.js to clinician-dashboard/rehab-game/compare-report"
```
(with the footer from Global Constraints)

---

### Task 12: `dashboard.html` — fix the floating chart panel on mobile

**Files:**
- Modify: `dashboard.html`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

Verified by reading the actual CSS (not assumed): `.compare-grid` (the Session A/B two-column layout) already collapses to a single column via an existing `@media (max-width: 1100px)` rule — no work needed there, the spec's concern about it is already satisfied by code that predates this plan. The one real, unaddressed problem is `#angleFloat` (the "📐 Angle Over Time" floating chart panel, `dashboard.html:1252-1263`): `position: fixed; bottom: 20px; right: 20px; width: 500px;` — a fixed 500px width overflows and overlaps content on any viewport narrower than ~540px (e.g. a 390px phone), which is exactly the overlap visible in earlier screenshots. Fix: resize and reposition it within the existing `@media (max-width: 1100px)` block rather than change its JS-driven collapse/expand/drag behavior at all.

- [ ] **Step 1: Add a mobile override for `#angleFloat`**

In `dashboard.html`, inside the existing `@media (max-width: 1100px) { ... }` block (starts at the line found via `grep -n "@media (max-width: 1100px)" dashboard.html`), add:
```css
            #angleFloat {
                left: 8px;
                right: 8px;
                bottom: 76px;
                width: auto;
            }
```
(`bottom: 76px` clears the new mobile tab bar's `64px` height plus margin, from Task 5's injected CSS — the two must not overlap. `width: auto` with both `left`/`right` set makes the panel fill the viewport width minus 8px margins on each side, replacing the fixed `500px`.)

- [ ] **Step 2: Manual verification**

Open `dashboard.html` in Chrome at a 390px-wide viewport (DevTools device toolbar). Confirm the "Angle Over Time" panel now spans the width of the screen with 8px margins, sits above the mobile tab bar (not overlapping it), and its collapse/expand toggle still works. At desktop width (>1100px), confirm the panel is unchanged (still 500px, bottom-right corner).

- [ ] **Step 3: Commit**

```bash
git add dashboard.html
git commit -m "fix: floating angle-chart panel overflows viewport on mobile"
```
(with the footer from Global Constraints)

---

### Task 13: README + CHANGELOG

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

- [ ] **Step 1: README — installability and Safari caveat**

Read `README.md` first. Add a short new section (placement matching the doc's existing structure — near the top, after any existing "features" description) covering: the app is installable as a PWA (Chrome/Edge: install icon in the address bar; Safari: Share → Add to Home Screen); the Safari/Web-Bluetooth caveat (no Web Bluetooth support on Safari at all — device-connection pages are view-only there, dashboard/report pages work normally); that releasing a new version requires bumping BOTH `config.js`'s `APP_CONFIG.version` AND `sw.js`'s `CACHE_NAME` constant (the version-check toast reads the former, the service-worker cache invalidation reads the latter — document this as a two-step release checklist so it isn't missed).

- [ ] **Step 2: CHANGELOG — new entry**

Read `CHANGELOG.md` first (already has entries from today's earlier firmware/webapp work). Add a new "Web application" entry under today's date: unified navigation and dark/light theme (previously copy-pasted/inconsistent/missing across pages, now one shared `app-shell.js`); PWA installability (manifest, icons, service worker, app-shell-only offline caching); version-check toast polling `/version.json`; responsive layout pass for mobile/tablet on all 11 patient/clinician-facing pages.

- [ ] **Step 3: Commit**

```bash
git add README.md CHANGELOG.md
git commit -m "docs: document PWA install, Safari caveat, and release checklist"
```
(with the footer from Global Constraints)

---

### Task 14: Final cross-page smoke test

**Files:** none modified.

**Interfaces:**
- Consumes: everything from Tasks 1-13.
- Produces: go/no-go confirmation before this work is considered done.

- [ ] **Step 1: Start the server**

```bash
node server.js
```

- [ ] **Step 2: Desktop pass (Chrome, ~1440px)**

Open each of the 11 in-scope pages. For each: nav pill bar renders with correct active item, theme toggle works, no console errors, page content unchanged from before this plan (visual regression check — compare against memory/prior screenshots for layout-sensitive pages like `dashboard.html`).

- [ ] **Step 3: Mobile pass (Chrome DevTools device toolbar, ~390px)**

Open each of the 11 pages. For each: bottom tab bar renders, "More" drawer opens/closes correctly and contains the right 3 links, no horizontal scroll, no content hidden behind the fixed tab bar (the `body{padding-bottom:64px}` rule from Task 5 should prevent this — verify on the pages with the most content, e.g. `dashboard.html`, `session-comparison-landscape.html`).

- [ ] **Step 4: PWA installability check**

Chrome DevTools → Application → Manifest: confirm it loads with no errors, all three icons resolve. Application → Service Workers: confirm `sw.js` is activated. Lighthouse panel → run a PWA audit on `index.html`: confirm "Installable" passes.

- [ ] **Step 5: Version-check test**

With the server running, edit `config.js`'s version string on disk (e.g. `'3.0.7'` → `'3.0.8-test'`), keep a browser tab open on any in-scope page from before the edit. Within 5 minutes (or by triggering `visibilitychange` — switch tabs away and back), the update toast should appear. Click Reload — page reloads and the toast doesn't reappear (the running version now matches). Revert `config.js` back to `'3.0.7'` and reload once more to leave the repo clean.

- [ ] **Step 6: Report**

If all checks pass, this plan is complete — no commit needed for this task (verification only). If any check fails, note which page/check and fix it as a small follow-up commit before considering the plan done.
