# Webapp Responsive Redesign, PWA, Theme Unification & Version Check — Design

## Goal

Make the Wergonic webapp usable on laptop and mobile, installable as a PWA on Chrome/Edge/Safari, and self-updating (toast prompt, never silent auto-reload). Along the way, unify two pieces of infrastructure that are currently copy-pasted and inconsistent per page: navigation and the dark/light theme toggle.

## Current state (verified against the code, not assumed)

- **Navigation**: a horizontal pill nav (`<a class="nav-link">`) is copy-pasted into each page's `<header>`, with different item sets on different pages (e.g. `live-record.html` is missing "Landscape Report"). Four in-scope pages have **no nav at all**: `dashboard.html`, `upload.html`, `session-comparison-landscape.html`, `rehab-game.html`.
- **Theme toggle**: a light/dark toggle exists independently on three pages only — `dashboard.html` (`localStorage` key `dashboard-theme`), `upload.html` (`wergonic-upload-theme`), `session-comparison-landscape.html` (`landscape-theme`) — each with its own copy-pasted `:root.light` CSS overrides and its own JS. Toggling theme on one page has no effect on another. Seven in-scope pages have no toggle at all and no `prefers-color-scheme` handling.
- **Versioning**: `config.js`'s `APP_CONFIG.version` (currently `'3.0.7'`) is already the single source of truth, shown as a badge on `index.html`. Nothing checks it against the server or prompts a reload.
- **PWA**: no `manifest.json`, no service worker, no icons anywhere in the repo (checked the two `.docx` guides too — no embedded logo to reuse).
- **Responsive groundwork**: viewport meta tags are present on all but the dev/test pages; `styles.css` has a handful of media queries already. Partial, not systematic.
- **Server**: `server.js` is a 10-line `express.static` server — trivial to extend with one JSON route.

## Scope

**In scope (10 pages):** `index.html`, `dashboard.html`, `upload.html`, `posture-viewer.html`, `live-record.html`, `clinician-dashboard.html`, `compare-report.html`, `session-comparison-landscape.html`, `rehab-game.html`, `demo.html`, `demo-report.html`.

**Out of scope:** `teacher-control.html`, `test-button.html`, `test-report.html`, `test-syntax.html` (dev/admin-only, least mobile-relevant). Full offline data caching (session CSVs). Native app wrapper. Any visual/brand redesign beyond what installability requires (colors/typography stay as they are — this is a structural and cross-cutting-infrastructure pass, not a reskin).

**Platform constraint (accepted, not solved):** Safari has no Web Bluetooth support at all (iOS or macOS). PWA install works everywhere; on Safari, `index.html` and `live-record.html`'s device-connection features simply can't work — view-only pages (dashboard, posture-viewer, reports) remain fully usable. No workaround exists; this is disclosed in the README, not hidden.

## 1. Shared app shell (`app-shell.js`)

One new file, included via `<script src="app-shell.js">` on all 10 in-scope pages (same pattern as the existing shared `config.js`), responsible for three things that today are copy-pasted or missing:

1. **Theme init and toggle.** Runs a tiny inline snippet *before* the shell script and before first paint (to avoid a flash of the wrong theme) that reads one unified `localStorage` key, `wergonic-theme` (`'light'` | `'dark'`), and if absent, falls back to `window.matchMedia('(prefers-color-scheme: light)')`. Applies `:root.light` (existing CSS convention, reused) or nothing (dark is the existing default). `app-shell.js` renders one toggle button (reusing the existing `☾`/`☀` markup/behavior) and writes explicit user choices back to `wergonic-theme`, so a choice persists across all pages, not just the one it was made on. Pages that already ship their own theme CSS (`dashboard.html`, `upload.html`, `session-comparison-landscape.html`) keep that CSS — only the storage key and JS glue are unified; the visual result is unchanged (same colors, same `:root.light` selector convention). Pages without a theme system today gain the same `:root.light` variables, scoped to reuse the color values already established by `dashboard.html`.
2. **Navigation.** Renders the desktop pill nav (unchanged visual style, current item set, now identical on every page) and, at ≤768px, switches to the approved combined pattern: a bottom tab bar (Home / Sessions / Compare / Live) whose "More" tab opens a drawer listing the rest (Comparison, Landscape Report, Posture Viewer). "Sessions" links to `demo-report.html`, "Compare" to `compare-report.html`, "Live" to `live-record.html` — same targets the desktop nav already uses.
3. **Version-check toast.** Polls `GET /version.json` (see §4) every 5 minutes and on `visibilitychange`/window focus. On a version mismatch from the value baked into `config.js` at load time, shows a small dismissible banner — "Update available — Reload" — and does nothing else. No auto-reload, ever; never interrupts an active BLE connection or recording, because it never acts on its own.

`app-shell.js` depends on `config.js` (for `APP_CONFIG.version`) and is depended on by nothing — pages that don't include it are simply unaffected, so rollout can be incremental per page during implementation if needed.

## 2. Responsive layout pass

Breakpoint: 768px, matching the nav switch. Per-page adjustments identified so far (implementation will audit each page individually rather than guess further):

- `dashboard.html`: the side-by-side Session A/Session B comparison stacks vertically below 768px; the floating "Angle Over Time" chart panel (currently `position: absolute`-ish, overlapping content per the current screenshot) becomes static, inline flow.
- Multi-column stat grids and tables (dashboard summary cards, comparison tables) collapse to single-column.
- Everything else: standard responsive hygiene (touch target sizing ≥44px, no horizontal scroll, forms/buttons full-width on mobile) applied page by page.

## 3. PWA installability

- `manifest.json` at repo root: `name`/`short_name` "Wergonic Training", `start_url: "index.html"`, `display: "standalone"`, `theme_color: "#1a5fb4"` (reused from the `<meta name="theme-color">` tags already present on several pages — first real instance of a brand color in the repo), `background_color` matching the dark theme's existing background.
- Icon set: no existing logo anywhere in the repo, so a simple monogram (a "W" mark in the theme blue, matching the existing accent color) is generated as the icon source and exported to the standard PWA sizes (192, 512, plus maskable variants). This is the one net-new visual asset in an otherwise structural pass.
- `<link rel="manifest">` and icon `<link>` tags added to all 10 in-scope pages.

## 4. Service worker & version endpoint

- `sw.js` at repo root, registered from `app-shell.js`. Caches the app shell only: the 10 in-scope HTML files, `app.js`, `config.js`, `app-shell.js`, `styles.css`, `gamification.css`, the icon set. Cache-first for these, network passthrough for everything else (CSV data, demo-data, BLE — none of which go through the service worker's cache logic). Cache name includes the app version so a deploy invalidates the old cache on activate.
- `server.js` gains one route: `GET /version.json` reads `config.js`, extracts `APP_CONFIG.version` via a small regex (no new dependency — no need for a JS parser for one string), and responds `{"version": "..."}` with `Cache-Control: no-store`. This keeps `config.js` as the single source of truth — nothing to remember to bump in two places.

## 5. What does NOT change

- No CSS/JS framework introduced. No build step. No SPA conversion.
- No changes to `app.js`'s BLE/session logic, or to any firmware protocol.
- No offline caching of session/report data — opening a report requires either a live connection, an upload, or a previous page load's in-memory state, exactly as today.
- Visual design (colors, typography, component styling) is unchanged except for the one new icon asset and whatever the `:root.light` unification requires to look right on pages that don't have it yet.

## Testing approach

No existing test harness for the webapp beyond `node --check` and manual browser verification (established pattern from the calibration/compat work already on this branch). Verification for this feature:
- `node --check` on every new/modified `.js` file.
- Manual smoke test at both breakpoints (desktop ~1440px, mobile ~390px) via the Chrome DevTools device toolbar, on all 10 in-scope pages: nav renders and navigates correctly, theme toggle persists across page loads and across different pages, no console errors.
- PWA installability check via Chrome's Lighthouse/Application panel (manifest valid, service worker registered, icons present).
- Manual version-mismatch test: bump `config.js`'s version locally, confirm the toast appears within one poll cycle and a manual reload picks up the new version.
