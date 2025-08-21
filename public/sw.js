/**
 * Turo Toll Tracker Service Worker
 * 
 * Provides:
 * - Offline functionality
 * - Background sync
 * - Push notifications
 * - App shell caching
 * - API response caching
 */

const CACHE_NAME = 'turo-tolls-v1.0.0';
const API_CACHE_NAME = 'turo-tolls-api-v1.0.0';
const BACKGROUND_SYNC_TAG = 'background-sync-toll-data';

// Files to cache for offline functionality
const STATIC_CACHE_FILES = [
    '/',
    '/index.html',
    '/dashboard.html',
    '/login-style.css',
    '/css/accessibility.css',
    '/js/xss-utils.js',
    '/js/accessibility.js',
    '/manifest.json',
    // Add icon files when available
    '/icons/icon-192x192.png',
    '/icons/icon-512x512.png'
];

// API endpoints to cache
const CACHEABLE_API_PATTERNS = [
    /^\/api\/dashboard\/summary/,
    /^\/api\/analytics/,
    /^\/api\/dashboard\/toll-accounts/,
    /^\/api\/transponders/
];

// API endpoints that should use background sync
const BACKGROUND_SYNC_PATTERNS = [
    /^\/api\/tolls\/import-csv/,
    /^\/api\/turo-sync\/import-csv/,
    /^\/api\/tolls\/match/,
    /^\/api\/invoices\/generate/
];

/**
 * Service Worker Installation
 */
self.addEventListener('install', event => {
    console.log('📦 Service Worker installing...');
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('📁 Caching app shell files');
                return cache.addAll(STATIC_CACHE_FILES);
            })
            .then(() => {
                console.log('✅ Service Worker installed successfully');
                return self.skipWaiting();
            })
            .catch(error => {
                console.error('❌ Service Worker installation failed:', error);
            })
    );
});

/**
 * Service Worker Activation
 */
self.addEventListener('activate', event => {
    console.log('🔄 Service Worker activating...');
    
    event.waitUntil(
        caches.keys()
            .then(cacheNames => {
                return Promise.all(
                    cacheNames.map(cacheName => {
                        // Delete old caches
                        if (cacheName !== CACHE_NAME && cacheName !== API_CACHE_NAME) {
                            console.log('🗑️ Deleting old cache:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
            .then(() => {
                console.log('✅ Service Worker activated');
                return self.clients.claim();
            })
    );
});

/**
 * Fetch Event Handler - Network requests interception
 */
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);
    
    // Skip non-HTTP requests
    if (!url.protocol.startsWith('http')) {
        return;
    }
    
    // Handle different types of requests
    if (request.url.includes('/api/')) {
        event.respondWith(handleApiRequest(request));
    } else {
        event.respondWith(handleStaticRequest(request));
    }
});

/**
 * Handle API requests with caching and offline fallback
 */
async function handleApiRequest(request) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    
    // Check if this is a cacheable API endpoint
    const isCacheable = CACHEABLE_API_PATTERNS.some(pattern => pattern.test(pathname));
    
    // Check if this should use background sync
    const useBackgroundSync = BACKGROUND_SYNC_PATTERNS.some(pattern => pattern.test(pathname));
    
    try {
        // Try network first
        const networkResponse = await fetch(request);
        
        // Cache successful GET responses
        if (isCacheable && request.method === 'GET' && networkResponse.ok) {
            const cache = await caches.open(API_CACHE_NAME);
            cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
        
    } catch (error) {
        console.log('🔌 Network request failed, trying cache:', pathname);
        
        // If network fails and it's a GET request, try cache
        if (request.method === 'GET' && isCacheable) {
            const cachedResponse = await caches.match(request);
            if (cachedResponse) {
                console.log('📋 Serving from cache:', pathname);
                return cachedResponse;
            }
        }
        
        // If it's a background sync request and network failed, store for later
        if (useBackgroundSync && request.method === 'POST') {
            return handleBackgroundSync(request);
        }
        
        // Return offline fallback
        return createOfflineFallback(request);
    }
}

/**
 * Handle static file requests
 */
async function handleStaticRequest(request) {
    // Try cache first for static files
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
        return cachedResponse;
    }
    
    try {
        // Try network
        const networkResponse = await fetch(request);
        
        // Cache successful responses
        if (networkResponse.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
        
    } catch (error) {
        // Return offline fallback for navigation requests
        if (request.mode === 'navigate') {
            const cachedIndex = await caches.match('/index.html');
            if (cachedIndex) {
                return cachedIndex;
            }
        }
        
        return createOfflineFallback(request);
    }
}

/**
 * Handle background sync for offline form submissions
 */
async function handleBackgroundSync(request) {
    try {
        // Store the request for background sync
        const requestData = {
            url: request.url,
            method: request.method,
            headers: Object.fromEntries(request.headers.entries()),
            body: await request.text(),
            timestamp: Date.now()
        };
        
        // Store in IndexedDB
        await storeForBackgroundSync(requestData);
        
        // Register background sync
        if ('serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype) {
            await self.registration.sync.register(BACKGROUND_SYNC_TAG);
        }
        
        return new Response(
            JSON.stringify({
                success: true,
                message: 'Request queued for when connection is restored',
                offline: true
            }),
            {
                status: 202,
                headers: { 'Content-Type': 'application/json' }
            }
        );
        
    } catch (error) {
        return createOfflineFallback(request);
    }
}

/**
 * Store request data for background sync
 */
async function storeForBackgroundSync(requestData) {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('turo-tolls-sync', 1);
        
        request.onupgradeneeded = event => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('pending-requests')) {
                db.createObjectStore('pending-requests', { keyPath: 'timestamp' });
            }
        };
        
        request.onsuccess = event => {
            const db = event.target.result;
            const transaction = db.transaction(['pending-requests'], 'readwrite');
            const store = transaction.objectStore('pending-requests');
            
            store.add(requestData);
            
            transaction.oncomplete = () => {
                db.close();
                resolve();
            };
            
            transaction.onerror = () => {
                db.close();
                reject(transaction.error);
            };
        };
        
        request.onerror = () => reject(request.error);
    });
}

/**
 * Background Sync Event Handler
 */
self.addEventListener('sync', event => {
    if (event.tag === BACKGROUND_SYNC_TAG) {
        console.log('🔄 Background sync triggered');
        event.waitUntil(processPendingRequests());
    }
});

/**
 * Process pending requests stored for background sync
 */
async function processPendingRequests() {
    try {
        const pendingRequests = await getPendingRequests();
        console.log(`📤 Processing ${pendingRequests.length} pending requests`);
        
        for (const requestData of pendingRequests) {
            try {
                // Recreate the request
                const request = new Request(requestData.url, {
                    method: requestData.method,
                    headers: requestData.headers,
                    body: requestData.body
                });
                
                // Try to send the request
                const response = await fetch(request);
                
                if (response.ok) {
                    console.log('✅ Background sync request successful:', requestData.url);
                    await removePendingRequest(requestData.timestamp);
                    
                    // Notify client of successful sync
                    notifyClients({
                        type: 'background-sync-success',
                        url: requestData.url,
                        timestamp: requestData.timestamp
                    });
                } else {
                    console.warn('⚠️ Background sync request failed:', response.status, requestData.url);
                }
                
            } catch (error) {
                console.error('❌ Background sync request error:', error, requestData.url);
            }
        }
        
    } catch (error) {
        console.error('❌ Background sync processing failed:', error);
    }
}

/**
 * Get pending requests from IndexedDB
 */
async function getPendingRequests() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('turo-tolls-sync', 1);
        
        request.onsuccess = event => {
            const db = event.target.result;
            const transaction = db.transaction(['pending-requests'], 'readonly');
            const store = transaction.objectStore('pending-requests');
            const getAllRequest = store.getAll();
            
            getAllRequest.onsuccess = () => {
                db.close();
                resolve(getAllRequest.result || []);
            };
            
            getAllRequest.onerror = () => {
                db.close();
                reject(getAllRequest.error);
            };
        };
        
        request.onerror = () => reject(request.error);
    });
}

/**
 * Remove pending request from IndexedDB
 */
async function removePendingRequest(timestamp) {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('turo-tolls-sync', 1);
        
        request.onsuccess = event => {
            const db = event.target.result;
            const transaction = db.transaction(['pending-requests'], 'readwrite');
            const store = transaction.objectStore('pending-requests');
            
            store.delete(timestamp);
            
            transaction.oncomplete = () => {
                db.close();
                resolve();
            };
            
            transaction.onerror = () => {
                db.close();
                reject(transaction.error);
            };
        };
        
        request.onerror = () => reject(request.error);
    });
}

/**
 * Create offline fallback response
 */
function createOfflineFallback(request) {
    const url = new URL(request.url);
    
    if (request.mode === 'navigate') {
        // Return offline page for navigation
        return new Response(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Offline - Turo Toll Tracker</title>
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body { font-family: system-ui; text-align: center; padding: 50px; background: #f5f5f7; }
                    .offline-container { max-width: 400px; margin: 0 auto; }
                    .offline-icon { font-size: 64px; margin-bottom: 20px; }
                    h1 { color: #007AFF; margin-bottom: 10px; }
                    p { color: #666; margin-bottom: 30px; }
                    .btn { background: #007AFF; color: white; padding: 12px 24px; border: none; border-radius: 8px; }
                </style>
            </head>
            <body>
                <div class="offline-container">
                    <div class="offline-icon">📱</div>
                    <h1>You're Offline</h1>
                    <p>Please check your internet connection and try again.</p>
                    <button class="btn" onclick="location.reload()">Try Again</button>
                </div>
            </body>
            </html>
        `, {
            status: 200,
            headers: { 'Content-Type': 'text/html' }
        });
    }
    
    if (url.pathname.includes('/api/')) {
        // Return JSON error for API requests
        return new Response(
            JSON.stringify({
                success: false,
                error: 'No internet connection. Please try again when online.',
                offline: true
            }),
            {
                status: 503,
                headers: { 'Content-Type': 'application/json' }
            }
        );
    }
    
    // Generic offline response
    return new Response('Offline', { status: 503 });
}

/**
 * Notify clients of service worker events
 */
function notifyClients(message) {
    self.clients.matchAll().then(clients => {
        clients.forEach(client => {
            client.postMessage(message);
        });
    });
}

/**
 * Push notification handler
 */
self.addEventListener('push', event => {
    if (!event.data) return;
    
    try {
        const data = event.data.json();
        const options = {
            body: data.body || 'You have a new toll notification',
            icon: '/icons/icon-192x192.png',
            badge: '/icons/icon-96x96.png',
            tag: data.tag || 'toll-notification',
            requireInteraction: data.requireInteraction || false,
            actions: data.actions || [
                {
                    action: 'view',
                    title: 'View Dashboard',
                    icon: '/icons/icon-96x96.png'
                },
                {
                    action: 'dismiss',
                    title: 'Dismiss'
                }
            ],
            data: data.data || {}
        };
        
        event.waitUntil(
            self.registration.showNotification(data.title || 'Turo Toll Tracker', options)
        );
        
    } catch (error) {
        console.error('❌ Push notification error:', error);
    }
});

/**
 * Notification click handler
 */
self.addEventListener('notificationclick', event => {
    event.notification.close();
    
    if (event.action === 'view' || !event.action) {
        event.waitUntil(
            self.clients.matchAll({ type: 'window' }).then(clients => {
                // Check if app is already open
                for (const client of clients) {
                    if (client.url.includes('/dashboard') && 'focus' in client) {
                        return client.focus();
                    }
                }
                
                // Open new window
                if (self.clients.openWindow) {
                    return self.clients.openWindow('/dashboard.html');
                }
            })
        );
    }
});

/**
 * Message handler for communication with main thread
 */
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    
    if (event.data && event.data.type === 'GET_VERSION') {
        event.ports[0].postMessage({ version: CACHE_NAME });
    }
});

console.log('🔧 Service Worker loaded successfully');