# Webapp Responsive/PWA/Theme/Version-Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship one shared `app-shell.js` that gives all 11 patient/clinician-facing pages a consistent responsive nav, a unified dark/light theme toggle, PWA installability, and a toast-based version-update check — replacing today's per-page copy-pasted (and frequently missing) nav and theme code.

**Architecture:** A single new `app-shell.js`, included via `<script src="app-shell.js">` in each page's `<head>` (synchronous, not deferred, so the theme class applies before first paint), owns three concerns: theme (one shared `localStorage` key, `:root.light` class convention already used by 3 of the pages), navigation (renders a desktop pill bar into a `#app-shell-nav` mount point and a fixed mobile bottom-tab-bar + "More" drawer — the drawer also carries the theme toggle, since the pill bar's toggle is hidden on mobile — injecting its own scoped `<style>` block), and version-checking (polls a new `/version.json` route added to `server.js`, shows a dismissible reload toast, never auto-reloads). A new service worker (`sw.js`) caches the app shell using a **network-first** strategy (not cache-first — see Task 7's rationale) so the update flow actually works. Icons are generated from hand-authored SVGs via `rsvg-convert`.

**Tech Stack:** Vanilla JS (ES5-compatible, no build step — matches the existing `app.js`/`config.js` style), plain CSS, Express (`server.js`, already present), `rsvg-convert` for icon rasterization (confirmed installed at `/opt/homebrew/bin/rsvg-convert`).

## Global Constraints

- No build step, no framework, no new npm dependencies. Match the existing vanilla-JS/inline-CSS style of the codebase.
- Every JS file change: verify with `node --check <file>`.
- Manual browser verification (Chrome DevTools device toolbar, desktop ~1440px and mobile ~390px widths) is the test harness for visual/interactive behavior — this codebase has no automated frontend test suite (established pattern from prior work on this branch).
- Theme convention: absence of the `light` class on `<html>` = dark (the site's existing default everywhere it's implemented); `<html class="light">` = light. One shared `localStorage` key: `wergonic-theme` (values `'light'` / `'dark'`). No stored value → follow `prefers-color-scheme`.
- Nav destinations (exactly these 7, unchanged from today's existing links, `teacher-control.html` and the `test-*.html` pages excluded per the approved spec): Home→`index.html`, Session Report→`demo-report.html`, Compare Reports→`compare-report.html`, Comparison→`demo.html`, Landscape Report→`session-comparison-landscape.html`, Posture Viewer→`posture-viewer.html`, Live Record→`live-record.html`.
- Mobile nav pattern (user-approved): bottom tab bar with Home / Sessions(→demo-report.html) / Compare(→compare-report.html) / Live(→live-record.html), plus a "More" tab opening a drawer with Comparison / Landscape Report / Posture Viewer / theme toggle.
- In-scope pages (11): `index.html`, `dashboard.html`, `upload.html`, `posture-viewer.html`, `live-record.html`, `clinician-dashboard.html`, `compare-report.html`, `session-comparison-landscape.html`, `rehab-game.html`, `demo.html`, `demo-report.html`. Out of scope: `teacher-control.html`, `test-button.html`, `test-report.html`, `test-syntax.html` — do not touch.
- `config.js`'s `APP_CONFIG.version` (currently `'3.0.7'`) stays the single source of truth for the app version — never hand-maintain a second version number.
- Never commit with `git add -A`/`git add .` — always explicit paths.
- Commit message footer (every commit):
  ```
  Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_017erP8GaUst5fUQNEEpecYg
  ```

## Task ordering rationale (read before executing — this plan was corrected after review)

Page-wiring (Tasks 8-10) runs **before** the `styles.css` dark-theme-default flip (Task 11), not after. Reasoning: flipping `styles.css`'s default to dark before the M3 pages have a toggle wired would commit a broken intermediate state (five pages rendering dark with zero way to switch back, and — until nav markup is removed in the same span — unstyled nav link soup once the old `.nav-link` CSS is deleted). Wiring first is safe in either order (the toggle no-ops harmlessly against the still-light `styles.css` default), then flipping the default and deleting the dead CSS is a clean, low-risk final step once every consumer has already moved off the old system.

## Per-page CSS reality (read before Tasks 8-10 — this is why they're split into three groups, not one)

Verified by reading each file — there is no single shared theme system today:

| Page | Theme system today | Treatment needed |
|---|---|---|
| `dashboard.html` | Own vars (`--bg-0` family), **already has working `:root.light`** + its own toggle (key `dashboard-theme`) | Rewire toggle to shared key only. No CSS change. No nav today (net new). |
| `upload.html` | Same `--bg-0` family, **already has `:root.light`** + own toggle (key `wergonic-upload-theme`) | Rewire toggle only. No CSS change. No nav today (net new). No `config.js` include today — add one (the shared shell depends on `APP_CONFIG` for the version badge/check). |
| `session-comparison-landscape.html` | Own `--dash-*` vars layered over `styles.css`, **already has `:root.light`** + own toggle (key `landscape-theme`) | Rewire toggle only. No CSS change. No nav today (net new). Has its own second `#angleFloat` floating panel with the same mobile-overflow bug as `dashboard.html`'s — fixed in Task 12. |
| `index.html`, `posture-viewer.html`, `live-record.html`, `demo-report.html` | Pure `styles.css` (M3 tokens), no local override, **no dark mode exists at all** | Fixed once, in `styles.css` (Task 11). Has old nav markup to remove (Task 9). All four already include `config.js` (verified — do not add a duplicate). |
| `demo.html` | Local vars that `var()`-reference M3 tokens directly (e.g. `--surface: var(--md-sys-color-surface-container-low)`) | Inherits Task 11's fix automatically. Has old nav markup to remove (Task 9). Already includes `config.js`. |
| `clinician-dashboard.html`, `rehab-game.html` | Own vars (`--bg`/`--bg1`/`--bg2`/`--cyan`/... family, identical between the two), **no light variant exists** | Needs a new `:root.light` block written for these var names (Task 10). No standard nav today. Neither includes `config.js` today — add it. |
| `compare-report.html` | Own `--cmp-*` vars layered over `styles.css`, **no light variant exists**, zero `--md-sys-*` references (confirmed) | Needs a new `:root.light` block for `--cmp-*` (Task 10). Has old nav markup to remove. Already includes `config.js`. |

## 1. File Structure

- Create: `icons/icon.svg` — hand-authored monogram source (rounded corners, used for the standard 192/512 icons).
- Create: `icons/icon-maskable.svg` — a second, **full-bleed square-cornered** source for the maskable icon (platforms apply their own mask; a maskable icon must fill the entire canvas with no transparent margin).
- Create: `icons/icon-192.png`, `icons/icon-512.png`, `icons/icon-maskable-512.png` — rasterized from the two SVGs.
- Create: `manifest.json` — PWA manifest.
- Modify: `config.js` — expose `APP_CONFIG` as a `window` property (it currently isn't one — see Task 4).
- Create: `app-shell.js` — theme + nav + version-check + SW registration (built incrementally across Tasks 4-6).
- Create: `sw.js` — service worker, app-shell caching, network-first.
- Modify: `server.js` — add `GET /version.json`.
- Modify: `clinician-dashboard.html`, `rehab-game.html`, `compare-report.html` — new `:root.light` blocks for their existing local variable names, plus `config.js` include for the first two.
- Modify: `dashboard.html`, `upload.html`, `session-comparison-landscape.html` — rewire theme toggle to the shared shell; `upload.html` also gains a `config.js` include.
- Modify: `index.html`, `posture-viewer.html`, `live-record.html`, `demo.html`, `demo-report.html` — remove old nav markup, wire the shell.
- Modify: `dashboard.html`, `session-comparison-landscape.html` — fix their respective `#angleFloat` panels' fixed pixel width overflowing mobile viewports (Task 12).
- Modify: `styles.css` — add dark-mode M3 tokens as the default `:root`, move today's (already-shipping) light values under `:root.light`; remove the now-dead `.navigation`/`.nav-link`/`.nav-version` rules (Task 11, runs after all six pages that used them have already stopped referencing them).

## 2. Icon monogram source

The two new visual assets (no logo exists anywhere in the repo — checked, including the two `.docx` guides). A rounded-square dark-blue background with a white "W", matching the existing `theme-color` (`#1a5fb4`) already present in several pages' `<meta>` tags; the maskable variant uses the same colors and glyph but with square corners and full bleed.

---

### Task 1: PWA icon set

**Files:**
- Create: `icons/icon.svg`
- Create: `icons/icon-maskable.svg`
- Create: `icons/icon-192.png`, `icons/icon-512.png`, `icons/icon-maskable-512.png`

**Interfaces:**
- Consumes: nothing.
- Produces: three PNG files at fixed paths, referenced by `manifest.json` (Task 2) and by `<link rel="icon">`/`<link rel="apple-touch-icon">` tags added to every page (Tasks 8-10).

- [ ] **Step 1: Write the standard icon SVG (rounded corners)**

Create `icons/icon.svg`:
```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#1a5fb4"/>
  <text x="256" y="326" font-family="Arial, Helvetica, sans-serif" font-size="280"
        font-weight="700" fill="#ffffff" text-anchor="middle">W</text>
</svg>
```

- [ ] **Step 2: Write the maskable icon SVG (full-bleed, square corners)**

A maskable icon must fill the entire canvas — no rounded corners, no transparent margin, since the OS applies its own mask shape (circle, squircle, rounded-square) on top. Create `icons/icon-maskable.svg`:
```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#1a5fb4"/>
  <text x="256" y="316" font-family="Arial, Helvetica, sans-serif" font-size="220"
        font-weight="700" fill="#ffffff" text-anchor="middle">W</text>
</svg>
```
(The glyph is sized smaller (220 vs 280) and centered slightly higher-baseline than the standard icon, keeping it inside the ~40% "safe zone" platforms use for maskable icons — a mask can crop up to ~20% from each edge without touching the letter.)

- [ ] **Step 3: Rasterize all three PNGs**

Run (repo root):
```bash
mkdir -p icons
rsvg-convert -w 192 -h 192 icons/icon.svg -o icons/icon-192.png
rsvg-convert -w 512 -h 512 icons/icon.svg -o icons/icon-512.png
rsvg-convert -w 512 -h 512 icons/icon-maskable.svg -o icons/icon-maskable-512.png
```
Expected: exit 0, three PNG files created. Verify:
```bash
file icons/icon-192.png icons/icon-512.png icons/icon-maskable-512.png
```
Expected: each line reports `PNG image data, 192 x 192` or `512 x 512` respectively.

- [ ] **Step 4: Commit**

```bash
git add icons/icon.svg icons/icon-maskable.svg icons/icon-192.png icons/icon-512.png icons/icon-maskable-512.png
git commit -m "feat: add PWA icon set (monogram, standard + maskable)"
```
(with the footer from Global Constraints)

---

### Task 2: PWA manifest

**Files:**
- Create: `manifest.json`

**Interfaces:**
- Consumes: `icons/icon-192.png`, `icons/icon-512.png`, `icons/icon-maskable-512.png` (Task 1).
- Produces: `manifest.json` at repo root, referenced by `<link rel="manifest" href="manifest.json">` added to every in-scope page (Tasks 8-10).

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
- Produces: `GET /version.json` → `{"version": "3.0.7"}` with `Cache-Control: no-store`. Consumed by `app-shell.js`'s version-check poll (Task 6) and by `sw.js`'s network-first fetch handler (Task 7), which must never cache this route.

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
SERVER_PID=$!
sleep 1
curl -s http://localhost:3000/version.json
kill $SERVER_PID
```
Expected: `{"version":"3.0.7"}` (or whatever `config.js` currently holds).

- [ ] **Step 4: Commit**

```bash
git add server.js
git commit -m "feat: add /version.json route for update-check polling"
```
(with the footer from Global Constraints)

---

### Task 4: `config.js` global fix + `app-shell.js` — theme engine

**Files:**
- Modify: `config.js`
- Create: `app-shell.js`

**Interfaces:**
- Consumes: `localStorage` (browser API), `window.matchMedia`.
- Produces: `window.APP_CONFIG` (a real global — see Step 1, fixing a pre-existing bug), `wergonicSetTheme(light: boolean): void` — applies/removes `.light` on `<html>` and persists to `localStorage['wergonic-theme']`. An IIFE that runs on script parse (before `DOMContentLoaded`) and applies the initial theme class. Both consumed by Task 5 (the toggle button calls `wergonicSetTheme`) and Task 6 (version-check reads `window.APP_CONFIG.version`).

`config.js` currently declares `const APP_CONFIG = {...}` at top level as a classic (non-module) script. A top-level `const`/`let` creates a global **lexical** binding but does **not** create a property on `window` — so `window.APP_CONFIG` is `undefined` everywhere in the codebase today. This is a pre-existing bug: `compare-report.html` and `demo-report.html` both already do `Array.isArray(window.APP_CONFIG && APP_CONFIG.demoDataFiles)`, which has always silently evaluated to `false`. Fixing it here (rather than working around it in `app-shell.js`) fixes those two call sites as a side effect.

- [ ] **Step 1: Expose `APP_CONFIG` on `window`**

In `config.js`, find the end of the `const APP_CONFIG = { ... };` declaration (read the file to find its closing `};`) and add immediately after it:
```js
window.APP_CONFIG = APP_CONFIG;
```

- [ ] **Step 2: Verify syntax**

```bash
node --check config.js
```
Expected: no output, exit 0.

- [ ] **Step 3: Write the theme engine**

Create `app-shell.js`:
```js
// Wergonic shared app shell: theme, navigation, version-check, service worker.
// Include via <script src="app-shell.js"></script> in <head>, NOT deferred/async,
// so the theme class is applied before first paint (no flash of wrong theme).
// Depends on config.js being loaded first (for window.APP_CONFIG) on pages that
// have it; degrades gracefully (empty version string) on pages that don't.

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
    var btns = document.querySelectorAll('.app-shell-theme-toggle');
    for (var i = 0; i < btns.length; i++) {
        btns[i].textContent = light ? '☀ Light' : '☾ Dark';
    }
    wergonicApplyChartDefaults();
}

function wergonicApplyChartDefaults() {
    // Best-effort dark/light defaults for Chart.js, if the page loads it
    // (index.html, demo-report.html). Guarded — most pages don't use Chart.js.
    if (typeof Chart === 'undefined') return;
    var isLight = document.documentElement.classList.contains('light');
    Chart.defaults.color = isLight ? '#1a2a3a' : '#c3d5ea';
    Chart.defaults.borderColor = isLight ? 'rgba(0,40,100,0.12)' : 'rgba(255,255,255,0.12)';
}
```

- [ ] **Step 4: Verify syntax**

```bash
node --check app-shell.js
```
Expected: no output, exit 0.

- [ ] **Step 5: Manual verification**

Add `<script src="config.js"></script><script src="app-shell.js"></script>` temporarily to the `<head>` of `index.html` (after its existing `config.js` include — remove the duplicate, it already has one), open it in Chrome, run in the DevTools console:
```js
window.APP_CONFIG.version
```
Expected: `"3.0.7"` (proves Step 1's fix works — this returned `undefined` before). Then:
```js
wergonicSetTheme(true); document.documentElement.classList.contains('light')
```
Expected: `true`. Reload the page — `<html>` should still have `class="light"` (persisted). Run `wergonicSetTheme(false)` and reload again — should be dark. Remove any temporary duplicate `<script>` tag before committing (Task 8/9's real wiring supersedes this).

- [ ] **Step 6: Commit**

```bash
git add config.js app-shell.js
git commit -m "fix: expose APP_CONFIG on window; feat: app-shell.js theme engine"
```
(with the footer from Global Constraints)

---

### Task 5: `app-shell.js` — navigation (desktop pill bar + mobile tabs/drawer)

**Files:**
- Modify: `app-shell.js`

**Interfaces:**
- Consumes: `wergonicSetTheme` (Task 4), `window.APP_CONFIG.version` (from `config.js`, optional — falls back to empty string if `config.js` isn't loaded on a given page).
- Produces: renders into a required `<div id="app-shell-nav"></div>` mount point (desktop pill bar) and appends a fixed bottom tab bar + drawer directly to `<body>` (mobile, no mount point needed — `position: fixed`). Runs automatically on `DOMContentLoaded`. The mobile tab bar and drawer render **independently** of whether `#app-shell-nav` exists, so a missing mount point only loses the desktop bar (and, since the pill bar is where the toggle button used to live, Step 1 below puts a second toggle inside the drawer so mobile users always have one regardless).

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
    var path = window.location.pathname.split('/').pop();
    return path || 'index.html';
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
        '.app-shell-theme-toggle{background:none;border:1px solid rgba(255,255,255,0.25);border-radius:999px;color:inherit;cursor:pointer;font-family:inherit;font-size:13px;}' +
        '.app-shell-pillbar .app-shell-theme-toggle{width:32px;height:32px;font-size:16px;line-height:1;}' +
        '.app-shell-drawer-toggle{width:100%;text-align:left;padding:12px 14px;margin-top:6px;border-top:1px solid rgba(255,255,255,0.1);}' +
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
        '<button type="button" class="app-shell-theme-toggle" aria-label="Toggle theme">' +
        (isLight ? '☀' : '☾') +
        '</button>' +
        '</div>' +
        '</div>';

    wergonicWireThemeButtons(mount);
}

function wergonicWireThemeButtons(scope) {
    var btns = scope.querySelectorAll('.app-shell-theme-toggle');
    for (var i = 0; i < btns.length; i++) {
        btns[i].addEventListener('click', function () {
            wergonicSetTheme(!document.documentElement.classList.contains('light'));
        });
    }
}

function wergonicRenderMobileTabs() {
    var current = wergonicCurrentPage();
    var moreActive = APP_SHELL_MORE_ITEMS.some(function (i) { return i.href === current; });
    var isLight = document.documentElement.classList.contains('light');

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
        '<button type="button" class="app-shell-theme-toggle app-shell-drawer-toggle">' +
        (isLight ? '☀ Light' : '☾ Dark') +
        '</button>' +
        '</div>';
    document.body.appendChild(drawer);

    wergonicWireThemeButtons(drawer);

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
    wergonicApplyChartDefaults();
});
```
(This replaces Task 4's simpler `wergonicSetTheme` button-lookup — Task 4's version queried a single `#app-shell-theme-toggle` by ID; this task changes `wergonicSetTheme` usage to the class-based `wergonicWireThemeButtons` helper so BOTH the pill-bar toggle and the drawer toggle update together. Also note Task 4's `wergonicSetTheme` already targets `.app-shell-theme-toggle` by class, not by ID — no change needed there, it was written that way from the start in Step 3 above.)

- [ ] **Step 2: Verify syntax**

```bash
node --check app-shell.js
```
Expected: no output, exit 0.

- [ ] **Step 3: Manual verification**

Temporarily add `<div id="app-shell-nav"></div>` right after `<body>` on `index.html` (its `<head>` already has `config.js` + `app-shell.js` from Task 4's verification, if not re-add them). Open in Chrome:
- At desktop width: a pill nav bar renders with 7 items, the current page highlighted, a version badge showing `v3.0.7`, and a theme toggle button that flips the page between light/dark on click.
- Resize to ≤768px (or use DevTools device toolbar): the pill bar disappears, a bottom tab bar with Home/Sessions/Compare/Live appears, tapping "More" opens a drawer with the other 3 destinations PLUS a theme toggle row at the bottom — tapping it flips the theme and updates both the drawer button's own label and (if visible) the desktop pill bar's icon; tapping outside the drawer sheet closes it.
- No console errors.
Remove the temporary `<div id="app-shell-nav">` before committing (added for real, correctly, in Tasks 8-10).

- [ ] **Step 4: Commit**

```bash
git add app-shell.js
git commit -m "feat: app-shell.js responsive navigation (desktop pill bar + mobile tabs/drawer with theme toggle)"
```
(with the footer from Global Constraints)

---

### Task 6: `app-shell.js` — version-check toast + service worker registration

**Files:**
- Modify: `app-shell.js`

**Interfaces:**
- Consumes: `GET /version.json` (Task 3), `window.APP_CONFIG.version`, `navigator.serviceWorker` (registers `sw.js`, built in Task 7 — registration here is safe even before `sw.js` exists, since the fetch will simply 404 and the `.catch` swallows it, but Task 7 must land before this is meaningfully useful in production).
- Produces: nothing consumed by later tasks — this is the last piece of `app-shell.js`.

- [ ] **Step 1: Replace `wergonicInjectStyles` with the full version including toast CSS**

The toast CSS must NOT be nested inside the `@media (max-width: 768px)` block from Task 5 (it needs to show on all screen sizes). Rather than insert into the middle of Task 5's template-literal string (error-prone), replace the ENTIRE `wergonicInjectStyles` function with this complete version (identical to Task 5's, with three new rules appended after the closing `'}'` of the media query):
```js
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
        '.app-shell-theme-toggle{background:none;border:1px solid rgba(255,255,255,0.25);border-radius:999px;color:inherit;cursor:pointer;font-family:inherit;font-size:13px;}' +
        '.app-shell-pillbar .app-shell-theme-toggle{width:32px;height:32px;font-size:16px;line-height:1;}' +
        '.app-shell-drawer-toggle{width:100%;text-align:left;padding:12px 14px;margin-top:6px;border-top:1px solid rgba(255,255,255,0.1);}' +
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
        '}' +
        '.app-shell-update-toast{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:70;display:flex;align-items:center;gap:10px;background:#1a5fb4;color:#fff;padding:10px 16px;border-radius:999px;box-shadow:0 8px 24px rgba(0,0,0,0.35);font-size:14px;}' +
        '.app-shell-update-toast button{background:rgba(255,255,255,0.2);border:none;color:#fff;border-radius:999px;padding:4px 12px;cursor:pointer;font-size:13px;}' +
        '#app-shell-dismiss-btn{padding:4px 8px;}';
    document.head.appendChild(style);
}
```
(Note the toast rules are string-concatenated with `+` immediately after the `'}'` that closes the `@media` block's string segment, and BEFORE the final `;` that ends the whole `style.textContent = ...` statement — i.e. they are sibling top-level rules, not nested inside the media query, so they apply at every screen width.)

- [ ] **Step 2: Add version-check and SW registration**

Append to `app-shell.js` (after the function replaced in Step 1):
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
```

- [ ] **Step 3: Wire the two new functions into the existing `DOMContentLoaded` listener**

Replace the `DOMContentLoaded` listener at the bottom of `app-shell.js` (from Task 5):
```js
document.addEventListener('DOMContentLoaded', function () {
    wergonicInjectStyles();
    wergonicRenderNav();
    wergonicRenderMobileTabs();
    wergonicApplyChartDefaults();
});
```
with:
```js
document.addEventListener('DOMContentLoaded', function () {
    wergonicInjectStyles();
    wergonicRenderNav();
    wergonicRenderMobileTabs();
    wergonicApplyChartDefaults();
    wergonicInitVersionCheck();
    wergonicRegisterServiceWorker();
});
```

- [ ] **Step 4: Verify syntax**

```bash
node --check app-shell.js
```
Expected: no output, exit 0.

- [ ] **Step 5: Manual verification**

With `server.js` running (`node server.js`) and `app-shell.js`/`#app-shell-nav` temporarily wired into `index.html` as in Task 5's Step 3: open the page, confirm no console errors and `GET /version.json` succeeds in the Network tab (returns `{"version":"3.0.7"}`). In DevTools, confirm the toast CSS (`.app-shell-update-toast`) is NOT scoped inside a media query — check the Elements panel's computed styles at both a wide and a narrow viewport, the rule should apply at both. Temporarily edit `config.js`'s version string on disk to `'3.0.8-test'`, keep the tab open from before the edit, wait for the next `visibilitychange` check (switch tabs away and back) or up to 5 minutes — the toast should appear. Click "Reload" — page reloads. On a fresh trigger, click the dismiss (✕) button — toast disappears without reloading. Revert `config.js`'s version back to `'3.0.7'`.

Remove any temporary wiring from `index.html` before committing.

- [ ] **Step 6: Commit**

```bash
git add app-shell.js
git commit -m "feat: app-shell.js version-check toast and service worker registration"
```
(with the footer from Global Constraints)

---

### Task 7: Service worker (`sw.js`) — network-first

**Files:**
- Create: `sw.js`

**Interfaces:**
- Consumes: nothing (standalone).
- Produces: registered by `app-shell.js` (Task 6) at `/sw.js`. `CACHE_NAME` must be bumped manually alongside `config.js`'s version at each release (documented in the README update, Task 13) — this is now purely for cache cleanup on activate, not the update-delivery mechanism (see rationale below).

**Why network-first, not cache-first:** a cache-first strategy on the shell HTML/JS would serve the OLD `config.js` (and old `app-shell.js`) from cache even after the user clicks "Reload" in the update toast — the toast would never stop reappearing, because the reloaded page still reads its own stale cached `config.js`. Network-first (falling back to cache only when the network is unavailable) means a reload always gets the current version when online, and still works offline via the cache fallback — satisfying both "installable app-shell caching" and "the Reload button actually updates the app" (the spec's explicit requirement).

- [ ] **Step 1: Write the service worker**

Create `sw.js`:
```js
// App-shell-only cache: HTML/CSS/JS/icons for the 11 in-scope pages.
// Network-first with cache fallback (see plan Task 7 for rationale — a
// cache-first strategy would make the update-check toast's Reload button
// never actually deliver the new version). No session/report data is
// cached — CSV/demo-data/BLE traffic is never intercepted below.
// Bump CACHE_NAME on each release alongside config.js's version, to
// garbage-collect the previous cache on activate.
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
    'gamification.js',
    'mission-cards-data.js',
    'icons/icon-192.png',
    'icons/icon-512.png',
    'icons/icon-maskable-512.png'
];

function wergonicIsShellRequest(pathname) {
    if (pathname === '/') return true;
    return SHELL_FILES.some((f) => pathname === '/' + f);
}

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
    if (!wergonicIsShellRequest(url.pathname)) {
        return; // not a shell file — network passthrough (data, /version.json, BLE-adjacent fetches, etc.)
    }
    event.respondWith(
        fetch(event.request)
            .then((response) => {
                const copy = response.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
                return response;
            })
            .catch(() => caches.match(event.request === '/' ? new Request(new URL('/index.html', url).href) : event.request))
    );
});
```

- [ ] **Step 2: Verify syntax**

```bash
node --check sw.js
```
Expected: no output, exit 0.

- [ ] **Step 3: Manual verification**

With `app-shell.js` registering it (temporarily wired per Task 6) and `server.js` running, open `index.html` in Chrome, DevTools → Application → Service Workers: confirm it shows "activated and running". Application → Cache Storage: confirm a `wergonic-shell-v3.0.7` cache exists containing the shell files. Reload once online (confirms network-first still updates the cache). Then set DevTools Network tab to "Offline" and reload: the page still loads (served from the cache fallback) — note this loads with degraded functionality (Chart.js/three.js are CDN-hosted and not cached, so charts/3D views won't render offline; this is expected and consistent with the "app-shell only" scope, not a bug).

- [ ] **Step 4: Commit**

```bash
git add sw.js
git commit -m "feat: add service worker (network-first app-shell caching)"
```
(with the footer from Global Constraints)

---

### Task 8: Wire Group A — pages with already-complete theme CSS (`dashboard.html`, `upload.html`, `session-comparison-landscape.html`)

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

*(The page's `.theme-toggle` CSS rules — `:root.light .theme-toggle` etc. — can stay; they're now unused by markup but harmless dead CSS, not worth a risky removal in this pass since they're interleaved with other rules in a large inline stylesheet. Optional cleanup, not required.)*

- [ ] **Step 4: Repeat for `upload.html`**

This page has NO `config.js` include today (verified) — add `<script src="config.js"></script>` right after the `<title>` tag, then `app-shell.js` + manifest + icon links after it:
```html
    <script src="config.js"></script>
    <script src="app-shell.js"></script>
    <link rel="manifest" href="manifest.json">
    <link rel="icon" href="icons/icon-192.png">
    <link rel="apple-touch-icon" href="icons/icon-192.png">
```
Add `<div id="app-shell-nav"></div>` as the first child of `<body>`. Remove the `<button class="theme-toggle" id="themeToggle">` markup. Remove the old toggle JS block (the IIFE using `localStorage` key `'wergonic-upload-theme'`, found via `const KEY = 'wergonic-upload-theme';`).

- [ ] **Step 5: Repeat for `session-comparison-landscape.html`**

Same edits: add `app-shell.js` + manifest + icon links (this page already links `config.js`, `mission-cards-data.js`, `gamification.js` — add `app-shell.js` alongside those, after `config.js`); add `<div id="app-shell-nav"></div>` as the first child of `<body>`; remove the `<button id="themeToggle">` markup; remove the old toggle JS (the IIFE using `STORAGE_KEY = 'landscape-theme'`, with the comment `// Theme toggle (mirrors dashboard.html)`).

- [ ] **Step 6: Manual verification**

Start the server (`node server.js`) and open each of the three pages in Chrome:
- Nav pill bar renders at desktop width with the correct page highlighted; theme toggle works and persists on reload.
- Resize to mobile width: bottom tab bar + drawer work as in Task 5's verification, including the drawer's own theme toggle.
- Toggling theme on `dashboard.html` and then loading `upload.html` shows the SAME theme (proves the shared key works) — this is new behavior (previously independent per page).
- No console errors, no duplicate/orphaned theme-toggle buttons visible.

- [ ] **Step 7: Commit**

```bash
git add dashboard.html upload.html session-comparison-landscape.html
git commit -m "feat: wire app-shell.js into dashboard/upload/landscape pages (shared theme + nav)"
```
(with the footer from Global Constraints)

---

### Task 9: Wire Group B — pure/derived M3 pages (`index.html`, `posture-viewer.html`, `live-record.html`, `demo.html`, `demo-report.html`)

**Files:**
- Modify: `index.html`, `posture-viewer.html`, `live-record.html`, `demo.html`, `demo-report.html`

**Interfaces:**
- Consumes: `app-shell.js` (Tasks 4-6), `manifest.json` (Task 2), `icons/*` (Task 1). Does NOT yet consume Task 11's `styles.css` dark-theme flip — that task runs after this one specifically so these pages have a working toggle in place before their visual default changes (see "Task ordering rationale" above).
- Produces: nothing consumed by later tasks.

All five pages already include `config.js` (verified directly — do not add a duplicate). All five have old `<nav class="navigation">...</nav>` markup (with `.nav-link` children) to remove — this markup must come out in the SAME commit as adding `app-shell.js`, since Task 11 later deletes the CSS these old classes depend on.

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

Read the file to find the existing nav block (the 8 `.nav-link` anchors: Home/Session Report/Compare Reports/Comparison/Landscape Report/Posture Viewer/Teacher Control/Live Record) and its exact enclosing wrapper element and indentation (do not assume the indentation level — match what's actually in the file). Remove the WHOLE wrapper element, not just the inner links, and replace it with:
```html
    <div id="app-shell-nav"></div>
```
placed as the first element inside `<body>`.

- [ ] **Step 3: Repeat Steps 1-2 for `posture-viewer.html`**

Its `config.js` include is in `<body>` (verified — not `<head>`, unlike `index.html`); add `app-shell.js` + manifest + icon links in `<head>`, right after the existing `<link rel="stylesheet" href="styles.css">` line (before the `<script type="importmap">` block) — `app-shell.js` doesn't need `config.js` to have executed yet, only by the time `DOMContentLoaded` fires, which is guaranteed regardless of where in the document `config.js`'s `<script>` tag sits. Same nav-block replacement (its nav has "Posture Viewer" marked `active` instead of "Home" — same 8-link structure otherwise, including the Teacher Control link to remove along with the rest of the wrapper).

- [ ] **Step 4: Repeat for `live-record.html`**

`config.js` is already in `<head>` — add `app-shell.js` + manifest + icon links after it. This page's nav block is missing 2 of the 8 items (Compare Reports and Landscape Report) — remove the whole wrapper regardless of which subset of links it contains; `app-shell.js` renders the full, correct, consistent 7-item set for every page.

- [ ] **Step 5: Repeat for `demo.html`**

`config.js` is in `<body>` (verified). Add `app-shell.js` + manifest + icon links in `<head>`, after the existing `<link rel="stylesheet" href="styles.css">` line. Remove its 8-item nav wrapper, add the mount div.

- [ ] **Step 6: Repeat for `demo-report.html`**

`config.js` is in `<body>` (verified — earlier drafts of this plan incorrectly claimed this page has no `config.js`; it does, further down the file). Add `app-shell.js` + manifest + icon links in `<head>`, after `styles.css`. Remove its 8-item nav wrapper, add the mount div.

- [ ] **Step 7: Manual verification**

Open all five pages in Chrome: `styles.css`'s current (not-yet-changed) light-only default still renders normally (Task 11 hasn't run yet), nav pill bar renders correctly with the right active item on top of the light background, mobile breakpoint works including the drawer's theme toggle, no leftover unstyled `.nav-link` elements anywhere, no console errors about missing `#app-shell-nav` mount points. Toggling the theme should work (flips to `:root.light`, which is currently a no-op visually on these pages since `:root` is already the same light values — confirm no visual glitch from this no-op state, just no change, which is correct and expected until Task 11).

- [ ] **Step 8: Commit**

```bash
git add index.html posture-viewer.html live-record.html demo.html demo-report.html
git commit -m "feat: wire app-shell.js into M3 pages, remove old nav markup"
```
(with the footer from Global Constraints)

---

### Task 10: Wire Group C — pages needing a new `:root.light` block (`clinician-dashboard.html`, `rehab-game.html`, `compare-report.html`)

**Files:**
- Modify: `clinician-dashboard.html`, `rehab-game.html`, `compare-report.html`

**Interfaces:**
- Consumes: `app-shell.js` (Tasks 4-6), `manifest.json` (Task 2), `icons/*` (Task 1).
- Produces: nothing consumed by later tasks.

`clinician-dashboard.html` and `rehab-game.html` share an identical `:root` block (`--bg`/`--bg1`/`--bg2`/`--cyan`/`--purple`/`--green`/`--orange`/`--red`/`--text`/`--text2`/`--border`/`--gc`/`--gp`/`--gg`) with no light variant, and neither includes `config.js` today. `compare-report.html` has its own `--cmp-*` block, also with no light variant, and already includes `config.js` — it also links `styles.css` but has zero `--md-sys-*` references (verified), so Task 11's changes to that file don't affect it visually.

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

Open all three pages in Chrome: default dark palette renders correctly (matches each page's existing look — unchanged, since default `:root` values weren't touched, only added to); toggling to light via the new nav's toggle button correctly re-colors each page's own `--bg`/`--cmp-*` components (charts, cards, etc.) using the new `:root.light` values; nav renders and works identically to the other pages (including the mobile drawer's toggle); `clinician-dashboard.html`'s "Patient View" button still works and still links to `rehab-game.html`.

- [ ] **Step 7: Commit**

```bash
git add clinician-dashboard.html rehab-game.html compare-report.html
git commit -m "feat: add light theme + app-shell.js to clinician-dashboard/rehab-game/compare-report"
```
(with the footer from Global Constraints)

---

### Task 11: `styles.css` — dark M3 theme (default) + remove dead nav CSS

**Files:**
- Modify: `styles.css`

**Interfaces:**
- Consumes: nothing. Runs AFTER Tasks 8-10 (all page wiring) precisely so this task's changes never produce a broken intermediate commit — every page that referenced the old `.navigation`/`.nav-link` CSS has already stopped doing so, and every M3 page already has a working theme toggle before its visual default changes.
- Produces: `:root.light` becomes a real thing on every page that links `styles.css` (index, posture-viewer, live-record, compare-report [zero `--md-sys-*` usage, unaffected visually], demo, demo-report — plus `demo.html`'s locally-derived vars inherit it automatically since they `var()`-reference these same M3 tokens).

**Known follow-up, not fixed by this task:** `gamification.css` (217 `--md-sys-*` references, linked by `index.html`, `demo.html`, `session-comparison-landscape.html`) and Chart.js-rendered charts (`index.html`, `demo-report.html` — mitigated by Task 4's `wergonicApplyChartDefaults`, but only for charts created after `DOMContentLoaded`; charts created synchronously at parse time, if any, may still render with light-mode-assuming default colors) will start responding to the dark/light toggle as a side effect of this task, since they consume the same M3 tokens. This is very likely a visual improvement (consistent dark UI) rather than a regression, but Task 14's smoke test explicitly checks it rather than assuming.

Current `styles.css` `:root` block (verified, lines 8-70) holds the M3 tokens as today's only (light) palette. This task makes that block the **`:root.light` override** (values unchanged — this is exactly what ships today, just relocated) and writes a new **dark** `:root` as the default.

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

By this point in the plan, no page references `.navigation`/`.nav-link`/`.nav-version` anymore (Tasks 8-10 removed every consumer). Read `styles.css` to find the current exact line range of the `.navigation`, `.nav-link`, `.nav-link:hover`, `.nav-link.active`, and `.nav-version` rules (originally around lines 191-232, but Step 1's edit shifts line numbers — re-locate by content, not by the old line numbers) and delete them. There is also a `@media (max-width: 640px)` block immediately following `.nav-version` — read its contents first; if it ONLY contains rules for the now-deleted nav classes, delete the whole block; if it also styles other things, keep the block and remove only the nav-specific rules inside it.

- [ ] **Step 3: Manual verification**

Open `index.html` in Chrome (no theme class on `<html>` yet — default state). Confirm the page now renders with a dark background (previously it was light) — this is the intended new default, and the nav/toggle from Task 9 already work against it. Click the theme toggle — confirm it switches to the light appearance matching what the page looked like before this task. Check `index.html` and `demo.html` (gamification.css consumers) and `demo-report.html` (Chart.js consumer) specifically for any low-contrast or invisible elements in the new dark default — this is the known follow-up area called out above; note anything found for Task 14, don't attempt a deep gamification.css audit here (out of this plan's bounded scope).

- [ ] **Step 4: Commit**

```bash
git add styles.css
git commit -m "feat: add dark M3 theme (new default); remove dead nav CSS"
```
(with the footer from Global Constraints)

---

### Task 12: Fix floating chart panels on mobile (`dashboard.html`, `session-comparison-landscape.html`)

**Files:**
- Modify: `dashboard.html`
- Modify: `session-comparison-landscape.html`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

Verified by reading the actual CSS (not assumed): `.compare-grid` (the Session A/B two-column layout on `dashboard.html`) already collapses to a single column via an existing `@media (max-width: 1100px)` rule — no work needed there, the spec's original concern about it is already satisfied by code that predates this plan. The real, unaddressed problem is each page's `#angleFloat` panel (the "📐 Angle Over Time" floating chart): `dashboard.html:1252-1263` sets `position: fixed; bottom: 20px; right: 20px; width: 500px;`, and `session-comparison-landscape.html` has its own separate `#angleFloat` with the same fixed-pixel-width pattern (`width: 460px`) — both overflow and overlap content on any viewport narrower than their fixed width (e.g. a 390px phone), which is exactly the overlap visible in earlier screenshots.

- [ ] **Step 1: `dashboard.html` — add a mobile override for `#angleFloat`**

Inside the existing `@media (max-width: 1100px) { ... }` block (locate via `grep -n "@media (max-width: 1100px)" dashboard.html`), add:
```css
            #angleFloat {
                left: 8px;
                right: 8px;
                bottom: 76px;
                width: auto;
            }
```
(`bottom: 76px` clears the mobile tab bar's `64px` height plus margin, from Task 5's injected CSS — the two must not overlap. `width: auto` with both `left`/`right` set makes the panel fill the viewport width minus 8px margins, replacing the fixed `500px`. This override applies from 1100px down to the true mobile breakpoint of 768px where the tab bar appears — between 769-1100px the panel goes full-width but the tab bar isn't present yet, so there's nothing to clear; the `bottom: 76px` value is simply unused headroom in that range, not a visual problem.)

- [ ] **Step 2: `session-comparison-landscape.html` — same fix**

Read the file to find its `#angleFloat` rule and the enclosing media query (if one already exists at a similar breakpoint, add the override inside it the same way as Step 1; if this page has no equivalent media query yet, add one: `@media (max-width: 768px) { #angleFloat { left: 8px; right: 8px; bottom: 76px; width: auto; } }`).

- [ ] **Step 3: Manual verification**

Open both pages in Chrome at a 390px-wide viewport (DevTools device toolbar). Confirm each "Angle Over Time" panel now spans the width of the screen with 8px margins, sits above the mobile tab bar (not overlapping it), and its collapse/expand toggle still works. At desktop width (>1100px for dashboard.html, >768px for the landscape page), confirm each panel is unchanged from its original fixed-width, bottom-right-corner position.

- [ ] **Step 4: Commit**

```bash
git add dashboard.html session-comparison-landscape.html
git commit -m "fix: floating angle-chart panels overflow viewport on mobile"
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

Read `CHANGELOG.md` first (already has entries from today's earlier firmware/webapp work). Add a new "Web application" entry under today's date: unified navigation and dark/light theme (previously copy-pasted/inconsistent/missing across pages, now one shared `app-shell.js`); fixed `window.APP_CONFIG` never actually being set on `window` (pre-existing bug affecting two pages' demo-file fallback logic); PWA installability (manifest, icons, network-first service worker, app-shell-only offline caching); version-check toast polling `/version.json`; responsive layout pass for mobile/tablet on all 11 patient/clinician-facing pages, including fixing two floating chart panels that previously overflowed narrow viewports.

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

Open each of the 11 in-scope pages. For each: nav pill bar renders with correct active item, theme toggle works, no console errors, page content unchanged from before this plan (visual regression check — compare against memory/prior screenshots for layout-sensitive pages like `dashboard.html`). Specifically check `index.html`, `demo.html`, and `demo-report.html` for any low-contrast or invisible elements introduced by Task 11's dark-mode flip (the known `gamification.css`/Chart.js follow-up area) — fix anything found as a small additional commit before considering this task done.

- [ ] **Step 3: Mobile pass (Chrome DevTools device toolbar, ~390px)**

Open each of the 11 pages. For each: bottom tab bar renders, "More" drawer opens/closes correctly, contains the right 3 links plus a working theme toggle, no horizontal scroll, no content hidden behind the fixed tab bar (the `body{padding-bottom:64px}` rule from Task 5 should prevent this — verify on the pages with the most content, e.g. `dashboard.html`, `session-comparison-landscape.html`). Confirm both floating chart panels (Task 12) stay within the viewport and above the tab bar.

- [ ] **Step 4: PWA installability check**

Chrome DevTools → Application → Manifest: confirm it loads with no errors, all three icons resolve. Application → Service Workers: confirm `sw.js` is activated. Lighthouse panel → run a PWA audit on `index.html`: confirm "Installable" passes.

- [ ] **Step 5: Version-check and update-delivery test**

With the server running, note the current running version in a browser tab (`window.APP_CONFIG.version` in DevTools console — should print `3.0.7`, confirming Task 4's `window` fix). Edit `config.js`'s version string on disk (e.g. `'3.0.7'` → `'3.0.8-test'`) and `sw.js`'s `CACHE_NAME` to match (`'wergonic-shell-v3.0.8-test'`), keeping the browser tab open from before the edit. Within 5 minutes (or by triggering `visibilitychange` — switch tabs away and back), the update toast should appear. Click Reload — page reloads AND `window.APP_CONFIG.version` now reads `3.0.8-test` in the console (this is the check that would have failed under the old cache-first service worker — confirms Task 7's network-first fix actually works), and the toast does not reappear. Revert both `config.js` and `sw.js` back to `3.0.7` and reload once more to leave the repo clean.

- [ ] **Step 6: Report**

If all checks pass, this plan is complete — no commit needed for this task (verification only). If any check fails, note which page/check and fix it as a small follow-up commit before considering the plan done.
