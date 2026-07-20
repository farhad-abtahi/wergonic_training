// ═══════════════════════════════════════════════════════════════
// Version Configuration
// Centralized version control for all pages
// ═══════════════════════════════════════════════════════════════

const APP_CONFIG = {
    version: '3.0.7',
    name: 'Wergonic Training',
    demoDataFiles: [
        // '1_arm.csv',
        // '1_trunk.csv',
        // '2_arm.csv',
        // '2_trunk.csv',
        'S10.CSV',
        'S11.CSV',
        'rightarm-C04-1.csv',
        'rightarm-C08-1.csv',
        'trunk-C04-1.csv',
        'trunk-C08-1.csv'
    ]
};
window.APP_CONFIG = APP_CONFIG;

// Update nav version labels without creating extra DOM churn.
function updateVersionElements() {
    document.querySelectorAll('.nav-version').forEach(el => {
        const nextText = 'v' + APP_CONFIG.version;
        if (el.textContent !== nextText) {
            el.textContent = nextText;
        }
    });
}

// Run once when DOM is ready (or immediately if already ready).
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateVersionElements);
} else {
    updateVersionElements();
}
