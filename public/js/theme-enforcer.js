/**
 * Theme Enforcer - Force Purple Quantum Matrix Theme
 * Ensures the dashboard displays with the correct purple theme
 */

class ThemeEnforcer {
    constructor() {
        this.purpleTheme = {
            primary: '#1f2937',
            secondary: '#6366f1', 
            dark: '#4b5563',
            gradient: 'linear-gradient(135deg, #1f2937 0%, #374151 50%, #4b5563 100%)'
        };
        this.init();
    }

    /**
     * Initialize theme enforcement
     */
    init() {
        console.log('🎨 Theme Enforcer: Initializing purple theme enforcement');
        
        // Apply after DOM is ready (using arrow functions to preserve context)
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.enforceTheme());
        } else {
            // DOM is already ready
            this.enforceTheme();
        }
        
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
        // Add null check for document.body
        if (!document.body) {
            console.warn('⚠️ Theme Enforcer: document.body not available yet');
            return;
        }
        
        const bodyStyles = window.getComputedStyle(document.body);
        const bgColor = bodyStyles.backgroundColor;
        const bgImage = bodyStyles.backgroundImage;
        
        console.log('🔍 Theme Enforcer: Theme verification', {
            backgroundColor: bgColor,
            backgroundImage: bgImage,
            hasGradient: bgImage.includes('gradient'),
            isGray: bgColor.includes('31') || bgColor.includes('41') || bgColor.includes('55')
        });
        
        // If theme is not applied correctly, show warning and retry (using arrow function)
        if (!bgImage.includes('gradient') && !bgColor.includes('31')) {
            console.warn('⚠️ Theme Enforcer: Gray theme not detected, retrying...');
            setTimeout(() => this.enforceTheme(), 100);
            this.showThemeIssueNotification();
        } else {
            console.log('✅ Theme Enforcer: Gray theme successfully applied');
        }
    }

    /**
     * Monitor for theme changes and reapply if needed
     */
    startThemeMonitoring() {
        // Check theme every 2 seconds (using arrow function to preserve context)
        setInterval(() => {
            if (document.body && !document.body.getAttribute('data-theme-enforced')) {
                console.log('🔄 Theme Enforcer: Theme lost, reapplying...');
                this.enforceTheme();
            }
        }, 2000);
        
        // Monitor for style changes using MutationObserver (using arrow function to preserve context)
        if (typeof MutationObserver !== 'undefined' && document.body) {
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
        notification.innerHTML = '🎨 Applying Gray Theme...';
        notification.style.cssText = `
            position: fixed;
            top: 10px;
            left: 10px;
            z-index: 10002;
            background: #1f2937;
            color: white;
            padding: 8px 12px;
            border-radius: 6px;
            font-size: 12px;
            font-family: -apple-system, BlinkMacSystemFont, sans-serif;
            border: 1px solid #6366f1;
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

