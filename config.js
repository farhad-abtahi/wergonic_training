// ═══════════════════════════════════════════════════════════════
// Version Configuration
// Centralized version control for all pages
// ═══════════════════════════════════════════════════════════════

const APP_CONFIG = {
    version: '3.0.2',
    name: 'Wergonic Training'
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
