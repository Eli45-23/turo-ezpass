/**
 * Performance Monitoring System
 * 
 * Tracks and reports performance metrics across the application
 */

class PerformanceMonitor {
    constructor() {
        this.metrics = {
            pageLoad: 0,
            firstPaint: 0,
            firstContentfulPaint: 0,
            largestContentfulPaint: 0,
            firstInputDelay: 0,
            cumulativeLayoutShift: 0,
            timeToInteractive: 0
        };
        
        this.userSession = {
            startTime: Date.now(),
            interactions: 0,
            errors: 0,
            pageViews: 1
        };
        
        this.init();
    }
    
    init() {
        this.measureCoreWebVitals();
        this.trackUserInteractions();
        this.trackErrors();
        this.setupReporting();
    }
    
    /**
     * Measure Core Web Vitals
     */
    measureCoreWebVitals() {
        // Largest Contentful Paint (LCP)
        if ('PerformanceObserver' in window) {
            new PerformanceObserver((entryList) => {
                const entries = entryList.getEntries();
                const lastEntry = entries[entries.length - 1];
                this.metrics.largestContentfulPaint = lastEntry.startTime;
            }).observe({ entryTypes: ['largest-contentful-paint'] });
            
            // First Input Delay (FID)
            new PerformanceObserver((entryList) => {
                const entries = entryList.getEntries();
                entries.forEach((entry) => {
                    this.metrics.firstInputDelay = entry.processingStart - entry.startTime;
                });
            }).observe({ entryTypes: ['first-input'] });
            
            // Cumulative Layout Shift (CLS)
            let clsValue = 0;
            new PerformanceObserver((entryList) => {
                const entries = entryList.getEntries();
                entries.forEach((entry) => {
                    if (!entry.hadRecentInput) {
                        clsValue += entry.value;
                        this.metrics.cumulativeLayoutShift = clsValue;
                    }
                });
            }).observe({ entryTypes: ['layout-shift'] });
            
            // Paint Timings
            new PerformanceObserver((entryList) => {
                const entries = entryList.getEntries();
                entries.forEach((entry) => {
                    if (entry.name === 'first-paint') {
                        this.metrics.firstPaint = entry.startTime;
                    } else if (entry.name === 'first-contentful-paint') {
                        this.metrics.firstContentfulPaint = entry.startTime;
                    }
                });
            }).observe({ entryTypes: ['paint'] });
        }
        
        // Page Load Time
        window.addEventListener('load', () => {
            setTimeout(() => {
                const perfData = performance.timing;
                this.metrics.pageLoad = perfData.loadEventEnd - perfData.navigationStart;
                this.calculateTimeToInteractive();
            }, 0);
        });
    }
    
    /**
     * Calculate Time to Interactive (TTI)
     */
    calculateTimeToInteractive() {
        const perfEntries = performance.getEntriesByType('navigation');
        if (perfEntries.length > 0) {
            const navigationEntry = perfEntries[0];
            this.metrics.timeToInteractive = navigationEntry.domInteractive;
        }
    }
    
    /**
     * Track user interactions
     */
    trackUserInteractions() {
        ['click', 'keydown', 'scroll', 'input'].forEach(eventType => {
            document.addEventListener(eventType, () => {
                this.userSession.interactions++;
            }, { passive: true });
        });
    }
    
    /**
     * Track JavaScript errors
     */
    trackErrors() {
        window.addEventListener('error', (event) => {
            this.userSession.errors++;
            this.reportError({
                message: event.message,
                filename: event.filename,
                lineno: event.lineno,
                colno: event.colno,
                stack: event.error?.stack
            });
        });
        
        window.addEventListener('unhandledrejection', (event) => {
            this.userSession.errors++;
            this.reportError({
                message: 'Unhandled Promise Rejection',
                reason: event.reason
            });
        });
    }
    
    /**
     * Set up periodic reporting
     */
    setupReporting() {
        // Report metrics when user leaves the page
        window.addEventListener('beforeunload', () => {
            this.sendMetrics();
        });
        
        // Report metrics every 30 seconds
        setInterval(() => {
            this.sendMetrics();
        }, 30000);
        
        // Report when page becomes hidden
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.sendMetrics();
            }
        });
    }
    
    /**
     * Send metrics to console (would be sent to analytics in production)
     */
    sendMetrics() {
        const sessionDuration = Date.now() - this.userSession.startTime;
        
        const report = {
            metrics: this.metrics,
            session: {
                ...this.userSession,
                duration: sessionDuration
            },
            page: {
                url: window.location.href,
                title: document.title,
                referrer: document.referrer
            },
            browser: {
                userAgent: navigator.userAgent,
                language: navigator.language,
                cookieEnabled: navigator.cookieEnabled,
                onLine: navigator.onLine
            },
            viewport: {
                width: window.innerWidth,
                height: window.innerHeight,
                devicePixelRatio: window.devicePixelRatio
            },
            timestamp: Date.now()
        };
        
        // In production, this would be sent to your analytics service
        console.group('📊 Performance Report');
        console.log('Core Web Vitals:');
        console.log(`  LCP: ${this.metrics.largestContentfulPaint.toFixed(2)}ms`);
        console.log(`  FID: ${this.metrics.firstInputDelay.toFixed(2)}ms`);
        console.log(`  CLS: ${this.metrics.cumulativeLayoutShift.toFixed(4)}`);
        console.log('Load Metrics:');
        console.log(`  Page Load: ${this.metrics.pageLoad}ms`);
        console.log(`  FCP: ${this.metrics.firstContentfulPaint.toFixed(2)}ms`);
        console.log(`  TTI: ${this.metrics.timeToInteractive.toFixed(2)}ms`);
        console.log('Session Data:');
        console.log(`  Duration: ${(sessionDuration / 1000).toFixed(1)}s`);
        console.log(`  Interactions: ${this.userSession.interactions}`);
        console.log(`  Errors: ${this.userSession.errors}`);
        console.groupEnd();
        
        return report;
    }
    
    /**
     * Report errors
     */
    reportError(errorInfo) {
        console.error('Performance Monitor - Error Tracked:', errorInfo);
        
        // In production, send to error tracking service
        // this.sendToErrorService(errorInfo);
    }
    
    /**
     * Mark custom metrics
     */
    mark(name) {
        if ('performance' in window && 'mark' in performance) {
            performance.mark(name);
        }
    }
    
    /**
     * Measure custom timing
     */
    measure(name, startMark, endMark) {
        if ('performance' in window && 'measure' in performance) {
            try {
                performance.measure(name, startMark, endMark);
                const measure = performance.getEntriesByName(name)[0];
                console.log(`⏱️ ${name}: ${measure.duration.toFixed(2)}ms`);
                return measure.duration;
            } catch (e) {
                console.warn(`Could not measure ${name}:`, e);
            }
        }
        return 0;
    }
    
    /**
     * Get performance recommendations
     */
    getRecommendations() {
        const recommendations = [];
        
        if (this.metrics.largestContentfulPaint > 2500) {
            recommendations.push({
                type: 'warning',
                metric: 'LCP',
                message: 'Largest Contentful Paint is above 2.5s. Consider optimizing images and critical resources.',
                value: this.metrics.largestContentfulPaint
            });
        }
        
        if (this.metrics.firstInputDelay > 100) {
            recommendations.push({
                type: 'warning',
                metric: 'FID',
                message: 'First Input Delay is above 100ms. Consider reducing JavaScript execution time.',
                value: this.metrics.firstInputDelay
            });
        }
        
        if (this.metrics.cumulativeLayoutShift > 0.1) {
            recommendations.push({
                type: 'warning',
                metric: 'CLS',
                message: 'Cumulative Layout Shift is above 0.1. Ensure images and ads have defined dimensions.',
                value: this.metrics.cumulativeLayoutShift
            });
        }
        
        if (this.metrics.pageLoad > 3000) {
            recommendations.push({
                type: 'info',
                metric: 'Load Time',
                message: 'Page load time is above 3s. Consider code splitting and lazy loading.',
                value: this.metrics.pageLoad
            });
        }
        
        return recommendations;
    }
    
    /**
     * Display performance badge (for development)
     */
    showPerformanceBadge() {
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            const badge = document.createElement('div');
            badge.id = 'performance-badge';
            badge.style.cssText = `
                position: fixed;
                top: 10px;
                right: 10px;
                background: rgba(0, 0, 0, 0.8);
                color: white;
                padding: 8px 12px;
                border-radius: 6px;
                font-family: monospace;
                font-size: 12px;
                z-index: 10000;
                cursor: pointer;
                transition: all 0.2s ease;
            `;
            
            const updateBadge = () => {
                const lcp = this.metrics.largestContentfulPaint;
                const color = lcp < 2500 ? '#10B981' : lcp < 4000 ? '#F59E0B' : '#EF4444';
                badge.style.borderLeft = `4px solid ${color}`;
                badge.innerHTML = `
                    📊 Performance<br>
                    LCP: ${lcp.toFixed(0)}ms<br>
                    CLS: ${this.metrics.cumulativeLayoutShift.toFixed(3)}
                `;
            };
            
            badge.addEventListener('click', () => {
                const recommendations = this.getRecommendations();
                if (recommendations.length > 0) {
                    console.group('🔧 Performance Recommendations');
                    recommendations.forEach(rec => {
                        console.log(`${rec.type.toUpperCase()}: ${rec.message}`);
                    });
                    console.groupEnd();
                } else {
                    console.log('✅ All Core Web Vitals are in good ranges!');
                }
            });
            
            document.body.appendChild(badge);
            
            // Update badge every 2 seconds
            setInterval(updateBadge, 2000);
            setTimeout(updateBadge, 1000);
        }
    }
}

// Initialize performance monitoring
const performanceMonitor = new PerformanceMonitor();

// Show performance badge in development
performanceMonitor.showPerformanceBadge();

// Export for global use
window.PerformanceMonitor = PerformanceMonitor;
window.performanceMonitor = performanceMonitor;