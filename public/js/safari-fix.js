/**
 * Safari-specific Cache Busting and Theme Fix
 * Addresses Safari's aggressive caching issues
 */

class SafariFix {
    constructor() {
        this.isSafari = this.detectSafari();
        this.currentVersion = '20250821-v2';
        this.init();
    }

    /**
     * Detect Safari browser
     */
    detectSafari() {
        const ua = navigator.userAgent;
        const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
        const isWebKit = /webkit/i.test(ua);
        const isIOS = /iPad|iPhone|iPod/.test(ua);
        
        console.log('🔍 Browser Detection:', {
            userAgent: ua,
            isSafari,
            isWebKit,
            isIOS,
            detected: isSafari || isIOS
        });
        
        return isSafari || isIOS;
    }

    /**
     * Initialize Safari fixes
     */
    init() {
        if (!this.isSafari) {
            console.log('✅ Non-Safari browser detected, skipping Safari fixes');
            return;
        }

        console.log('🍎 Safari detected - applying aggressive cache fixes');
        
        // Apply fixes
        this.checkVersionAndClearCache();
        this.forceStyleReload();
        this.registerServiceWorkerWithForceUpdate();
        this.addForceRefreshButton();
        this.preventCaching();
    }

    /**
     * Check version and clear cache if needed
     */
    checkVersionAndClearCache() {
        const storedVersion = localStorage.getItem('safari-dashboard-version');
        
        if (storedVersion !== this.currentVersion) {
            console.log('🔄 Version mismatch - clearing all caches for Safari');
            
            // Clear all storage
            localStorage.clear();
            sessionStorage.clear();
            
            // Clear any cached stylesheets
            this.clearStylesheetCache();
            
            // Store new version
            localStorage.setItem('safari-dashboard-version', this.currentVersion);
            
            // Force reload if not first time
            if (storedVersion && storedVersion !== this.currentVersion) {
                console.log('🔄 Forcing page reload for Safari cache clear');
                setTimeout(() => {
                    window.location.reload(true);
                }, 100);
                return;
            }
        }
    }

    /**
     * Clear stylesheet cache
     */
    clearStylesheetCache() {
        const links = document.querySelectorAll('link[rel="stylesheet"]');
        links.forEach(link => {
            const href = link.href;
            const newHref = href + (href.includes('?') ? '&' : '?') + 'safari-bust=' + Date.now();
            link.href = newHref;
        });
    }

    /**
     * Force style reload with cache busting
     */
    forceStyleReload() {
        // Force recomputation of CSS
        document.documentElement.style.display = 'none';
        document.documentElement.offsetHeight; // Trigger reflow
        document.documentElement.style.display = '';
        
        // Force repaint
        document.body.style.transform = 'translateZ(0)';
        document.body.offsetHeight; // Trigger reflow
        document.body.style.transform = '';
    }

    /**
     * Register service worker with force update for Safari
     */
    async registerServiceWorkerWithForceUpdate() {
        if (!('serviceWorker' in navigator)) {
            return;
        }

        try {
            // Unregister existing service worker first
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (const registration of registrations) {
                console.log('🗑️ Safari: Unregistering old service worker');
                await registration.unregister();
            }

            // Register with cache busting
            const swUrl = `/sw.js?safari-v=${this.currentVersion}&t=${Date.now()}`;
            const registration = await navigator.serviceWorker.register(swUrl, {
                scope: '/',
                updateViaCache: 'none'
            });

            console.log('✅ Safari: Service worker registered with force update');

            // Force immediate update check
            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        console.log('🔄 Safari: New service worker installed, activating...');
                        newWorker.postMessage({ type: 'SKIP_WAITING' });
                    }
                });
            });

            // Listen for cache clear messages
            navigator.serviceWorker.addEventListener('message', (event) => {
                if (event.data.type === 'CACHE_CLEARED') {
                    console.log('✅ Safari: Service worker cleared caches');
                }
            });

            // Force update check
            registration.update();

        } catch (error) {
            console.error('❌ Safari: Service worker registration failed:', error);
        }
    }

    /**
     * Add force refresh button for manual cache clearing
     */
    addForceRefreshButton() {
        // Create refresh button
        const refreshBtn = document.createElement('button');
        refreshBtn.innerHTML = '🔄 Clear Safari Cache';
        refreshBtn.className = 'safari-refresh-btn';
        refreshBtn.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            z-index: 10000;
            background: #FF3B30;
            color: white;
            border: none;
            padding: 8px 12px;
            border-radius: 6px;
            font-size: 12px;
            cursor: pointer;
            font-family: -apple-system, BlinkMacSystemFont, sans-serif;
            box-shadow: 0 2px 10px rgba(0,0,0,0.3);
        `;

        refreshBtn.addEventListener('click', () => {
            this.forceClearAndReload();
        });

        document.body.appendChild(refreshBtn);

        // Auto-hide after 10 seconds
        setTimeout(() => {
            if (refreshBtn.parentNode) {
                refreshBtn.style.opacity = '0.3';
                refreshBtn.style.pointerEvents = 'none';
            }
        }, 10000);
    }

    /**
     * Force clear all caches and reload
     */
    async forceClearAndReload() {
        console.log('🔄 Safari: Manual cache clear initiated');
        
        // Clear all storage
        localStorage.clear();
        sessionStorage.clear();
        
        // Clear service worker cache
        if ('caches' in window) {
            const cacheNames = await caches.keys();
            await Promise.all(cacheNames.map(name => caches.delete(name)));
        }
        
        // Unregister service workers
        if ('serviceWorker' in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            await Promise.all(registrations.map(reg => reg.unregister()));
        }
        
        // Force reload
        window.location.reload(true);
    }

    /**
     * Prevent caching with meta tags and headers
     */
    preventCaching() {
        // Add additional meta tags for Safari
        const metaTags = [
            ['http-equiv', 'Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0'],
            ['http-equiv', 'Pragma', 'no-cache'],
            ['http-equiv', 'Expires', '-1'],
            ['name', 'apple-mobile-web-app-capable', 'yes'],
            ['name', 'apple-mobile-web-app-status-bar-style', 'black-translucent']
        ];

        metaTags.forEach(([attr, name, content]) => {
            const existing = document.querySelector(`meta[${attr}="${name}"]`);
            if (!existing) {
                const meta = document.createElement('meta');
                meta.setAttribute(attr, name);
                meta.setAttribute('content', content);
                document.head.appendChild(meta);
            }
        });
    }
}

// Initialize Safari fixes when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        new SafariFix();
    });
} else {
    new SafariFix();
}

// Export for manual access
window.SafariFix = SafariFix;