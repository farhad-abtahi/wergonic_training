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
        'rightArm_VCBC04_reformatted.csv',
        'rightArm_VCBC08_reformatted.csv',
        'trunk_VCBC04_reformatted.csv',
        'trunk_VCBC08_reformatted.csv'
    ]
};

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
