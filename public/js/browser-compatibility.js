// Browser Compatibility Layer
// Provides polyfills and fallbacks for cross-browser compatibility
// Ensures the app works on all browsers regardless of version or vendor

(function() {
    'use strict';
    
    console.log('🌐 Loading browser compatibility layer...');
    
    // Check browser capabilities and provide warnings if needed
    function checkBrowserCompatibility() {
        const issues = [];
        const warnings = [];
        
        // Check for basic JavaScript support
        if (!window.fetch) {
            issues.push('fetch API not supported');
        }
        
        if (!window.localStorage) {
            issues.push('localStorage not supported');
        }
        
        if (!window.sessionStorage) {
            warnings.push('sessionStorage not supported');
        }
        
        if (!window.Promise) {
            issues.push('Promises not supported');
        }
        
        // Check for console (some older browsers don't have it)
        if (!window.console) {
            window.console = {
                log: function() {},
                error: function() {},
                warn: function() {},
                info: function() {}
            };
        }
        
        console.log('🔍 Browser compatibility check:', {
            issues: issues.length,
            warnings: warnings.length,
            userAgent: navigator.userAgent
        });
        
        return { issues, warnings };
    }
    
    // Polyfill for fetch if not available
    function addFetchPolyfill() {
        if (!window.fetch) {
            console.warn('⚠️ Adding fetch polyfill for older browsers');
            
            window.fetch = function(url, options) {
                return new Promise(function(resolve, reject) {
                    const xhr = new XMLHttpRequest();
                    const method = (options && options.method) || 'GET';
                    
                    xhr.open(method, url);
                    
                    // Set headers
                    if (options && options.headers) {
                        for (const header in options.headers) {
                            xhr.setRequestHeader(header, options.headers[header]);
                        }
                    }
                    
                    // Handle credentials
                    if (options && options.credentials === 'include') {
                        xhr.withCredentials = true;
                    }
                    
                    xhr.onload = function() {
                        const response = {
                            ok: xhr.status >= 200 && xhr.status < 300,
                            status: xhr.status,
                            statusText: xhr.statusText,
                            headers: {
                                get: function(name) {
                                    return xhr.getResponseHeader(name);
                                },
                                entries: function() {
                                    return [];
                                }
                            },
                            json: function() {
                                return Promise.resolve(JSON.parse(xhr.responseText));
                            },
                            text: function() {
                                return Promise.resolve(xhr.responseText);
                            },
                            url: url
                        };
                        resolve(response);
                    };
                    
                    xhr.onerror = function() {
                        reject(new Error('Network error'));
                    };
                    
                    xhr.send((options && options.body) || null);
                });
            };
        }
    }
    
    // Polyfill for Promise if not available
    function addPromisePolyfill() {
        if (!window.Promise) {
            console.warn('⚠️ Adding Promise polyfill for older browsers');
            
            // Very basic Promise implementation
            window.Promise = function(executor) {
                const self = this;
                self.state = 'pending';
                self.value = undefined;
                self.callbacks = [];
                
                function resolve(value) {
                    if (self.state === 'pending') {
                        self.state = 'fulfilled';
                        self.value = value;
                        self.callbacks.forEach(callback => {
                            if (callback.onFulfilled) {
                                setTimeout(() => callback.onFulfilled(value), 0);
                            }
                        });
                    }
                }
                
                function reject(reason) {
                    if (self.state === 'pending') {
                        self.state = 'rejected';
                        self.value = reason;
                        self.callbacks.forEach(callback => {
                            if (callback.onRejected) {
                                setTimeout(() => callback.onRejected(reason), 0);
                            }
                        });
                    }
                }
                
                try {
                    executor(resolve, reject);
                } catch (error) {
                    reject(error);
                }
            };
            
            window.Promise.prototype.then = function(onFulfilled, onRejected) {
                const self = this;
                return new Promise((resolve, reject) => {
                    function handleCallback() {
                        try {
                            if (self.state === 'fulfilled') {
                                const result = onFulfilled ? onFulfilled(self.value) : self.value;
                                resolve(result);
                            } else if (self.state === 'rejected') {
                                if (onRejected) {
                                    const result = onRejected(self.value);
                                    resolve(result);
                                } else {
                                    reject(self.value);
                                }
                            }
                        } catch (error) {
                            reject(error);
                        }
                    }
                    
                    if (self.state === 'pending') {
                        self.callbacks.push({ onFulfilled, onRejected: handleCallback });
                    } else {
                        setTimeout(handleCallback, 0);
                    }
                });
            };
            
            window.Promise.prototype.catch = function(onRejected) {
                return this.then(null, onRejected);
            };
            
            window.Promise.resolve = function(value) {
                return new Promise(resolve => resolve(value));
            };
            
            window.Promise.reject = function(reason) {
                return new Promise((resolve, reject) => reject(reason));
            };
        }
    }
    
    // Add localStorage fallback using cookies
    function addStorageFallbacks() {
        if (!window.localStorage) {
            console.warn('⚠️ Adding localStorage fallback using cookies');
            
            window.localStorage = {
                getItem: function(key) {
                    const name = 'localStorage_' + key + '=';
                    const decodedCookie = decodeURIComponent(document.cookie);
                    const ca = decodedCookie.split(';');
                    
                    for (let i = 0; i < ca.length; i++) {
                        let c = ca[i];
                        while (c.charAt(0) === ' ') {
                            c = c.substring(1);
                        }
                        if (c.indexOf(name) === 0) {
                            return c.substring(name.length, c.length);
                        }
                    }
                    return null;
                },
                
                setItem: function(key, value) {
                    const expirationDays = 365;
                    const date = new Date();
                    date.setTime(date.getTime() + (expirationDays * 24 * 60 * 60 * 1000));
                    const expires = "; expires=" + date.toUTCString();
                    document.cookie = 'localStorage_' + key + "=" + value + expires + "; path=/; SameSite=Lax";
                },
                
                removeItem: function(key) {
                    document.cookie = 'localStorage_' + key + '=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
                },
                
                clear: function() {
                    // Clear all localStorage cookies
                    const cookies = document.cookie.split(';');
                    for (let i = 0; i < cookies.length; i++) {
                        const cookie = cookies[i];
                        const eqPos = cookie.indexOf('=');
                        const name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim();
                        if (name.startsWith('localStorage_')) {
                            document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
                        }
                    }
                }
            };
        }
        
        if (!window.sessionStorage) {
            console.warn('⚠️ sessionStorage not available - using memory storage');
            
            // Simple in-memory storage for session
            const memoryStorage = {};
            
            window.sessionStorage = {
                getItem: function(key) {
                    return memoryStorage[key] || null;
                },
                setItem: function(key, value) {
                    memoryStorage[key] = value;
                },
                removeItem: function(key) {
                    delete memoryStorage[key];
                },
                clear: function() {
                    for (const key in memoryStorage) {
                        delete memoryStorage[key];
                    }
                }
            };
        }
    }
    
    // Add Array methods for older browsers
    function addArrayPolyfills() {
        if (!Array.prototype.forEach) {
            Array.prototype.forEach = function(callback, thisArg) {
                for (let i = 0; i < this.length; i++) {
                    callback.call(thisArg, this[i], i, this);
                }
            };
        }
        
        if (!Array.prototype.map) {
            Array.prototype.map = function(callback, thisArg) {
                const result = [];
                for (let i = 0; i < this.length; i++) {
                    result[i] = callback.call(thisArg, this[i], i, this);
                }
                return result;
            };
        }
        
        if (!Array.prototype.filter) {
            Array.prototype.filter = function(callback, thisArg) {
                const result = [];
                for (let i = 0; i < this.length; i++) {
                    if (callback.call(thisArg, this[i], i, this)) {
                        result.push(this[i]);
                    }
                }
                return result;
            };
        }
    }
    
    // Add Object methods for older browsers
    function addObjectPolyfills() {
        if (!Object.keys) {
            Object.keys = function(obj) {
                const keys = [];
                for (const key in obj) {
                    if (obj.hasOwnProperty(key)) {
                        keys.push(key);
                    }
                }
                return keys;
            };
        }
        
        if (!Object.assign) {
            Object.assign = function(target) {
                if (target == null) {
                    throw new TypeError('Cannot convert undefined or null to object');
                }
                
                const to = Object(target);
                
                for (let index = 1; index < arguments.length; index++) {
                    const nextSource = arguments[index];
                    
                    if (nextSource != null) {
                        for (const nextKey in nextSource) {
                            if (Object.prototype.hasOwnProperty.call(nextSource, nextKey)) {
                                to[nextKey] = nextSource[nextKey];
                            }
                        }
                    }
                }
                return to;
            };
        }
    }
    
    // Add event handling improvements for older browsers
    function improveEventHandling() {
        // Ensure addEventListener exists
        if (!window.addEventListener && window.attachEvent) {
            window.addEventListener = function(type, listener) {
                window.attachEvent('on' + type, listener);
            };
        }
        
        // Ensure removeEventListener exists
        if (!window.removeEventListener && window.detachEvent) {
            window.removeEventListener = function(type, listener) {
                window.detachEvent('on' + type, listener);
            };
        }
    }
    
    // Initialize all polyfills
    function init() {
        try {
            checkBrowserCompatibility();
            addPromisePolyfill();
            addFetchPolyfill();
            addStorageFallbacks();
            addArrayPolyfills();
            addObjectPolyfills();
            improveEventHandling();
            
            console.log('✅ Browser compatibility layer loaded successfully');
            
            // Set global flag that compatibility layer is ready
            window._browserCompatibilityReady = true;
            
            // Fire custom event
            if (document.createEvent) {
                const event = document.createEvent('Event');
                event.initEvent('browserCompatibilityReady', true, true);
                document.dispatchEvent(event);
            }
        } catch (error) {
            console.error('❌ Browser compatibility layer failed:', error);
        }
    }
    
    // Initialize immediately
    init();
    
})();