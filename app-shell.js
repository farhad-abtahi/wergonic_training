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
