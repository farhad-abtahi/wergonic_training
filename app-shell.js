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
        '}' +
        '.app-shell-update-toast{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:70;display:flex;align-items:center;gap:10px;background:#1a5fb4;color:#fff;padding:10px 16px;border-radius:999px;box-shadow:0 8px 24px rgba(0,0,0,0.35);font-size:14px;}' +
        '.app-shell-update-toast button{background:rgba(255,255,255,0.2);border:none;color:#fff;border-radius:999px;padding:4px 12px;cursor:pointer;font-size:13px;}' +
        '#app-shell-dismiss-btn{padding:4px 8px;}';
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
    wergonicApplyChartDefaults();
    wergonicInitVersionCheck();
    wergonicRegisterServiceWorker();
});
