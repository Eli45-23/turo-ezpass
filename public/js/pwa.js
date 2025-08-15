/**
 * Progressive Web App (PWA) Functionality
 * 
 * Handles:
 * - Service worker registration
 * - App installation prompts
 * - Offline status detection
 * - Background sync status
 * - Push notification setup
 */

class PWAManager {
    constructor() {
        this.deferredPrompt = null;
        this.isInstalled = false;
        this.swRegistration = null;
        this.isOnline = navigator.onLine;
        
        this.init();
    }

    async init() {
        console.log('📱 Initializing PWA functionality...');
        
        // Check if PWA is supported
        if (!this.isPWASupported()) {
            console.log('ℹ️ PWA features not fully supported on this browser');
            return;
        }
        
        // Register service worker
        await this.registerServiceWorker();
        
        // Setup installation prompt
        this.setupInstallPrompt();
        
        // Setup offline detection
        this.setupOfflineDetection();
        
        // Setup background sync status
        this.setupBackgroundSyncStatus();
        
        // Check if already installed
        this.checkInstallationStatus();
        
        console.log('✅ PWA manager initialized');
    }

    /**
     * Check if PWA features are supported
     */
    isPWASupported() {
        return 'serviceWorker' in navigator && 'caches' in window && 'PushManager' in window;
    }

    /**
     * Register service worker
     */
    async registerServiceWorker() {
        if (!('serviceWorker' in navigator)) {
            console.log('❌ Service workers not supported');
            return;
        }

        try {
            this.swRegistration = await navigator.serviceWorker.register('/sw.js');
            console.log('✅ Service worker registered:', this.swRegistration.scope);
            
            // Listen for service worker updates
            this.swRegistration.addEventListener('updatefound', () => {
                const newWorker = this.swRegistration.installing;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        this.showUpdateAvailable();
                    }
                });
            });
            
            // Listen for messages from service worker
            navigator.serviceWorker.addEventListener('message', event => {
                this.handleServiceWorkerMessage(event.data);
            });
            
        } catch (error) {
            console.error('❌ Service worker registration failed:', error);
        }
    }

    /**
     * Setup app installation prompt
     */
    setupInstallPrompt() {
        // Listen for beforeinstallprompt event
        window.addEventListener('beforeinstallprompt', event => {
            console.log('📲 Install prompt available');
            
            // Prevent the default prompt
            event.preventDefault();
            
            // Store the event for later use
            this.deferredPrompt = event;
            
            // Show custom install button
            this.showInstallButton();
        });
        
        // Listen for app installation
        window.addEventListener('appinstalled', event => {
            console.log('🎉 App installed successfully');
            this.isInstalled = true;
            this.hideInstallButton();
            this.showInstallSuccess();
        });
    }

    /**
     * Show custom install button
     */
    showInstallButton() {
        // Check if install button already exists
        let installButton = document.getElementById('pwa-install-button');
        
        if (!installButton) {
            // Create install button
            installButton = document.createElement('button');
            installButton.id = 'pwa-install-button';
            installButton.className = 'btn btn-primary pwa-install-btn';
            installButton.innerHTML = '📱 Install App';
            installButton.setAttribute('aria-label', 'Install Turo Toll Tracker app');
            
            // Add click handler
            installButton.addEventListener('click', () => this.promptInstall());
            
            // Add to navigation area
            const navLinks = document.querySelector('.nav-links');
            if (navLinks) {
                navLinks.insertBefore(installButton, navLinks.firstChild);
            }
        }
        
        installButton.style.display = 'inline-block';
        
        // Announce to screen readers
        if (window.accessibilityManager) {
            window.accessibilityManager.announce('App installation is available');
        }
    }

    /**
     * Hide install button
     */
    hideInstallButton() {
        const installButton = document.getElementById('pwa-install-button');
        if (installButton) {
            installButton.style.display = 'none';
        }
    }

    /**
     * Prompt user to install app
     */
    async promptInstall() {
        if (!this.deferredPrompt) {
            console.log('❌ No install prompt available');
            return;
        }

        try {
            // Show the prompt
            this.deferredPrompt.prompt();
            
            // Wait for user choice
            const { outcome } = await this.deferredPrompt.userChoice;
            
            console.log(`📲 Install prompt outcome: ${outcome}`);
            
            if (outcome === 'accepted') {
                console.log('✅ User accepted the install prompt');
            } else {
                console.log('❌ User dismissed the install prompt');
            }
            
            // Clear the deferred prompt
            this.deferredPrompt = null;
            this.hideInstallButton();
            
        } catch (error) {
            console.error('❌ Install prompt failed:', error);
        }
    }

    /**
     * Check if app is already installed
     */
    checkInstallationStatus() {
        // Check if running in standalone mode
        if (window.matchMedia('(display-mode: standalone)').matches || 
            window.navigator.standalone === true) {
            this.isInstalled = true;
            console.log('📱 App is running in installed mode');
            this.hideInstallButton();
        }
    }

    /**
     * Setup offline status detection
     */
    setupOfflineDetection() {
        // Create offline status indicator
        this.createOfflineIndicator();
        
        // Listen for online/offline events
        window.addEventListener('online', () => {
            this.isOnline = true;
            this.updateOfflineStatus();
            this.syncPendingData();
        });
        
        window.addEventListener('offline', () => {
            this.isOnline = false;
            this.updateOfflineStatus();
        });
        
        // Initial status update
        this.updateOfflineStatus();
    }

    /**
     * Create offline status indicator
     */
    createOfflineIndicator() {
        let indicator = document.getElementById('offline-indicator');
        
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = 'offline-indicator';
            indicator.className = 'offline-indicator';
            indicator.setAttribute('role', 'status');
            indicator.setAttribute('aria-live', 'polite');
            
            // Add to top of page
            document.body.insertBefore(indicator, document.body.firstChild);
        }
    }

    /**
     * Update offline status display
     */
    updateOfflineStatus() {
        const indicator = document.getElementById('offline-indicator');
        if (!indicator) return;
        
        if (this.isOnline) {
            indicator.style.display = 'none';
            indicator.textContent = '';
        } else {
            indicator.style.display = 'block';
            indicator.innerHTML = `
                <div class="offline-banner">
                    <span class="offline-icon">📡</span>
                    <span class="offline-text">You're offline. Changes will sync when connection is restored.</span>
                </div>
            `;
        }
        
        // Announce status change
        if (window.accessibilityManager) {
            const message = this.isOnline ? 'Connection restored' : 'You are now offline';
            window.accessibilityManager.announce(message, true);
        }
    }

    /**
     * Setup background sync status monitoring
     */
    setupBackgroundSyncStatus() {
        // Create sync status indicator
        this.createSyncIndicator();
        
        // Check for pending sync data on page load
        this.checkPendingSyncData();
    }

    /**
     * Create sync status indicator
     */
    createSyncIndicator() {
        let indicator = document.getElementById('sync-indicator');
        
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = 'sync-indicator';
            indicator.className = 'sync-indicator';
            indicator.setAttribute('role', 'status');
            indicator.setAttribute('aria-live', 'polite');
            indicator.style.display = 'none';
            
            // Add after offline indicator
            const offlineIndicator = document.getElementById('offline-indicator');
            if (offlineIndicator) {
                offlineIndicator.parentNode.insertBefore(indicator, offlineIndicator.nextSibling);
            } else {
                document.body.insertBefore(indicator, document.body.firstChild);
            }
        }
    }

    /**
     * Show sync status
     */
    showSyncStatus(message, type = 'info') {
        const indicator = document.getElementById('sync-indicator');
        if (!indicator) return;
        
        const icons = {
            info: '📤',
            success: '✅',
            error: '❌',
            warning: '⚠️'
        };
        
        indicator.innerHTML = `
            <div class="sync-banner sync-${type}">
                <span class="sync-icon">${icons[type] || icons.info}</span>
                <span class="sync-text">${message}</span>
            </div>
        `;
        
        indicator.style.display = 'block';
        
        // Auto-hide success messages
        if (type === 'success') {
            setTimeout(() => {
                indicator.style.display = 'none';
            }, 5000);
        }
        
        // Announce to screen readers
        if (window.accessibilityManager) {
            window.accessibilityManager.announce(message, type === 'error');
        }
    }

    /**
     * Check for pending sync data
     */
    async checkPendingSyncData() {
        try {
            // Open IndexedDB to check for pending requests
            const request = indexedDB.open('turo-tolls-sync', 1);
            
            request.onsuccess = event => {
                const db = event.target.result;
                
                if (!db.objectStoreNames.contains('pending-requests')) {
                    db.close();
                    return;
                }
                
                const transaction = db.transaction(['pending-requests'], 'readonly');
                const store = transaction.objectStore('pending-requests');
                const countRequest = store.count();
                
                countRequest.onsuccess = () => {
                    const pendingCount = countRequest.result;
                    
                    if (pendingCount > 0) {
                        this.showSyncStatus(
                            `${pendingCount} action${pendingCount === 1 ? '' : 's'} pending sync`,
                            'warning'
                        );
                    }
                    
                    db.close();
                };
            };
            
        } catch (error) {
            console.warn('⚠️ Could not check pending sync data:', error);
        }
    }

    /**
     * Sync pending data when back online
     */
    async syncPendingData() {
        if (!this.swRegistration || !this.isOnline) return;
        
        try {
            // Trigger background sync
            if ('sync' in this.swRegistration) {
                await this.swRegistration.sync.register('background-sync-toll-data');
                this.showSyncStatus('Syncing pending changes...', 'info');
            }
        } catch (error) {
            console.error('❌ Background sync failed:', error);
            this.showSyncStatus('Sync failed. Please try again.', 'error');
        }
    }

    /**
     * Handle messages from service worker
     */
    handleServiceWorkerMessage(data) {
        switch (data.type) {
            case 'background-sync-success':
                this.showSyncStatus('Changes synced successfully!', 'success');
                break;
                
            case 'background-sync-failed':
                this.showSyncStatus('Sync failed. Will retry automatically.', 'warning');
                break;
                
            case 'cache-updated':
                this.showUpdateAvailable();
                break;
                
            default:
                console.log('📨 Service worker message:', data);
        }
    }

    /**
     * Show update available notification
     */
    showUpdateAvailable() {
        // Create update notification
        const notification = document.createElement('div');
        notification.className = 'update-notification';
        notification.innerHTML = `
            <div class="update-banner">
                <span class="update-icon">🔄</span>
                <span class="update-text">A new version is available!</span>
                <button class="btn btn-small update-btn" onclick="pwaManager.applyUpdate()">Update</button>
                <button class="btn btn-small btn-secondary" onclick="this.parentNode.parentNode.remove()">Later</button>
            </div>
        `;
        
        document.body.insertBefore(notification, document.body.firstChild);
        
        // Announce to screen readers
        if (window.accessibilityManager) {
            window.accessibilityManager.announce('App update available', true);
        }
    }

    /**
     * Apply service worker update
     */
    async applyUpdate() {
        if (!this.swRegistration || !this.swRegistration.waiting) {
            console.log('❌ No update available');
            return;
        }
        
        try {
            // Tell the waiting service worker to skip waiting
            this.swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
            
            // Reload the page to activate the new service worker
            setTimeout(() => {
                window.location.reload();
            }, 1000);
            
        } catch (error) {
            console.error('❌ Update failed:', error);
        }
    }

    /**
     * Show install success message
     */
    showInstallSuccess() {
        // Create success notification
        const notification = document.createElement('div');
        notification.className = 'install-success-notification';
        notification.innerHTML = `
            <div class="success-banner">
                <span class="success-icon">🎉</span>
                <span class="success-text">App installed successfully! You can now use it offline.</span>
                <button class="btn btn-small" onclick="this.parentNode.parentNode.remove()">Got it</button>
            </div>
        `;
        
        document.body.insertBefore(notification, document.body.firstChild);
        
        // Auto-remove after 10 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 10000);
    }

    /**
     * Request notification permission
     */
    async requestNotificationPermission() {
        if (!('Notification' in window)) {
            console.log('❌ Notifications not supported');
            return false;
        }
        
        if (Notification.permission === 'granted') {
            return true;
        }
        
        if (Notification.permission === 'denied') {
            console.log('❌ Notifications denied by user');
            return false;
        }
        
        try {
            const permission = await Notification.requestPermission();
            return permission === 'granted';
        } catch (error) {
            console.error('❌ Notification permission request failed:', error);
            return false;
        }
    }

    /**
     * Subscribe to push notifications
     */
    async subscribeToPushNotifications() {
        if (!this.swRegistration) {
            console.log('❌ Service worker not registered');
            return null;
        }
        
        const hasPermission = await this.requestNotificationPermission();
        if (!hasPermission) {
            return null;
        }
        
        try {
            // Get existing subscription
            let subscription = await this.swRegistration.pushManager.getSubscription();
            
            if (!subscription) {
                // Create new subscription
                subscription = await this.swRegistration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: this.urlBase64ToUint8Array(
                        // This would be your VAPID public key
                        'YOUR_VAPID_PUBLIC_KEY_HERE'
                    )
                });
            }
            
            console.log('🔔 Push notification subscription:', subscription);
            return subscription;
            
        } catch (error) {
            console.error('❌ Push notification subscription failed:', error);
            return null;
        }
    }

    /**
     * Convert VAPID key
     */
    urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding)
            .replace(/-/g, '+')
            .replace(/_/g, '/');
        
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        
        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        
        return outputArray;
    }

    /**
     * Get app installation status
     */
    getInstallationStatus() {
        return {
            isInstalled: this.isInstalled,
            canInstall: !!this.deferredPrompt,
            isOnline: this.isOnline,
            swRegistered: !!this.swRegistration
        };
    }
}

// Initialize PWA manager when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.pwaManager = new PWAManager();
    });
} else {
    window.pwaManager = new PWAManager();
}

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.PWAManager = PWAManager;
}