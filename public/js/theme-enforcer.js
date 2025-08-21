/**
 * Theme Enforcer - Force Purple Quantum Matrix Theme
 * Ensures the dashboard displays with the correct purple theme
 */

class ThemeEnforcer {
    constructor() {
        this.purpleTheme = {
            primary: '#2D1B69',
            secondary: '#553C8B', 
            dark: '#1a0e3d',
            gradient: 'linear-gradient(135deg, #2D1B69 0%, #553C8B 50%, #1a0e3d 100%)'
        };
        this.init();
    }

    /**
     * Initialize theme enforcement
     */
    init() {
        console.log('🎨 Theme Enforcer: Initializing purple theme enforcement');
        
        // Apply immediately
        this.enforceTheme();
        
        // Apply after DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.enforceTheme());
        }
        
        // Apply after all resources load
        window.addEventListener('load', () => this.enforceTheme());
        
        // Monitor for theme changes and reapply if needed
        this.startThemeMonitoring();
    }

    /**
     * Force apply purple theme
     */
    enforceTheme() {
        console.log('🎨 Theme Enforcer: Applying purple theme');
        
        // Force HTML background
        if (document.documentElement) {
            document.documentElement.style.setProperty('background', this.purpleTheme.primary, 'important');
            document.documentElement.style.setProperty('min-height', '100vh', 'important');
        }
        
        // Force body background with gradient
        if (document.body) {
            const body = document.body;
            body.style.setProperty('background', this.purpleTheme.primary, 'important');
            body.style.setProperty('background-image', this.purpleTheme.gradient, 'important');
            body.style.setProperty('background-attachment', 'fixed', 'important');
            body.style.setProperty('min-height', '100vh', 'important');
            body.style.setProperty('color', 'white', 'important');
            body.style.setProperty('font-family', "'Inter', sans-serif", 'important');
            
            // Add data attribute for verification
            body.setAttribute('data-theme-enforced', 'true');
            body.setAttribute('data-theme-version', '20250821-purple');
        }
        
        // Ensure critical containers don't block background
        this.fixContainerBackgrounds();
        
        // Verify theme application
        this.verifyTheme();
    }

    /**
     * Fix container backgrounds that might block the theme
     */
    fixContainerBackgrounds() {
        const containers = [
            '.app-layout',
            '.main-content', 
            '.dashboard-container'
        ];
        
        containers.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            elements.forEach(element => {
                element.style.setProperty('background', 'transparent', 'important');
            });
        });
    }

    /**
     * Verify theme is properly applied
     */
    verifyTheme() {
        const bodyStyles = window.getComputedStyle(document.body);
        const bgColor = bodyStyles.backgroundColor;
        const bgImage = bodyStyles.backgroundImage;
        
        console.log('🔍 Theme Enforcer: Theme verification', {
            backgroundColor: bgColor,
            backgroundImage: bgImage,
            hasGradient: bgImage.includes('gradient'),
            isPurple: bgColor.includes('45') || bgColor.includes('27') || bgColor.includes('105')
        });
        
        // If theme is not applied correctly, show warning and retry
        if (!bgImage.includes('gradient') && !bgColor.includes('45')) {
            console.warn('⚠️ Theme Enforcer: Purple theme not detected, retrying...');
            setTimeout(() => this.enforceTheme(), 100);
            this.showThemeIssueNotification();
        } else {
            console.log('✅ Theme Enforcer: Purple theme successfully applied');
        }
    }

    /**
     * Monitor for theme changes and reapply if needed
     */
    startThemeMonitoring() {
        // Check theme every 2 seconds
        setInterval(() => {
            if (document.body && !document.body.getAttribute('data-theme-enforced')) {
                console.log('🔄 Theme Enforcer: Theme lost, reapplying...');
                this.enforceTheme();
            }
        }, 2000);
        
        // Monitor for style changes using MutationObserver
        if (typeof MutationObserver !== 'undefined') {
            const observer = new MutationObserver((mutations) => {
                mutations.forEach(mutation => {
                    if (mutation.type === 'attributes' && 
                        mutation.attributeName === 'style' && 
                        mutation.target === document.body) {
                        
                        const bodyStyles = window.getComputedStyle(document.body);
                        if (!bodyStyles.backgroundImage.includes('gradient')) {
                            console.log('🔄 Theme Enforcer: Style change detected, reapplying theme...');
                            setTimeout(() => this.enforceTheme(), 50);
                        }
                    }
                });
            });
            
            observer.observe(document.body, {
                attributes: true,
                attributeFilter: ['style', 'class']
            });
        }
    }

    /**
     * Show notification if theme has issues
     */
    showThemeIssueNotification() {
        // Create temporary notification
        const notification = document.createElement('div');
        notification.innerHTML = '🎨 Applying Purple Theme...';
        notification.style.cssText = `
            position: fixed;
            top: 10px;
            left: 10px;
            z-index: 10002;
            background: #2D1B69;
            color: white;
            padding: 8px 12px;
            border-radius: 6px;
            font-size: 12px;
            font-family: -apple-system, BlinkMacSystemFont, sans-serif;
            border: 1px solid #553C8B;
        `;
        
        document.body.appendChild(notification);
        
        // Remove after 3 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 3000);
    }

    /**
     * Manual theme reset function
     */
    resetTheme() {
        console.log('🔄 Theme Enforcer: Manual theme reset requested');
        document.body.removeAttribute('data-theme-enforced');
        this.enforceTheme();
    }
}

// Initialize theme enforcer immediately
console.log('🎨 Loading Theme Enforcer...');
const themeEnforcer = new ThemeEnforcer();

// Export for manual access
window.ThemeEnforcer = ThemeEnforcer;
window.themeEnforcer = themeEnforcer;

// Add manual reset button for debugging
if (window.location.hostname === 'localhost' || window.location.hostname.includes('dev')) {
    setTimeout(() => {
        const resetBtn = document.createElement('button');
        resetBtn.innerHTML = '🎨 Reset Theme';
        resetBtn.className = 'theme-reset-btn';
        resetBtn.style.cssText = `
            position: fixed;
            bottom: 10px;
            right: 10px;
            z-index: 10003;
            background: #553C8B;
            color: white;
            border: none;
            padding: 8px 12px;
            border-radius: 6px;
            font-size: 12px;
            cursor: pointer;
            font-family: -apple-system, BlinkMacSystemFont, sans-serif;
            opacity: 0.7;
        `;

        resetBtn.addEventListener('click', () => {
            themeEnforcer.resetTheme();
        });

        document.body.appendChild(resetBtn);

        // Auto-hide after 15 seconds
        setTimeout(() => {
            if (resetBtn.parentNode) {
                resetBtn.style.opacity = '0.3';
                resetBtn.style.pointerEvents = 'none';
            }
        }, 15000);
    }, 1000);
}