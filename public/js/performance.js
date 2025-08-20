/**
 * Performance Optimization Module
 * 
 * This module provides performance enhancements including:
 * - Lazy loading for images and heavy components
 * - Intersection Observer for efficient viewport detection
 * - Debounced search and filter functions
 * - Virtual scrolling for large lists
 * - Resource preloading and caching
 * - Performance monitoring utilities
 */

class PerformanceOptimizer {
    constructor() {
        this.observers = new Map();
        this.debounceTimers = new Map();
        this.cache = new Map();
        this.metrics = {
            loadTime: 0,
            renderTime: 0,
            cacheHits: 0,
            cacheMisses: 0
        };
        
        this.init();
    }
    
    init() {
        this.setupIntersectionObserver();
        this.setupPerformanceMetrics();
        this.preloadCriticalResources();
        this.optimizeEventListeners();
    }
    
    /**
     * Lazy Loading Implementation
     */
    setupIntersectionObserver() {
        // Lazy load images
        this.imageObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    const src = img.dataset.src;
                    
                    if (src) {
                        img.src = src;
                        img.removeAttribute('data-src');
                        img.classList.add('loaded');
                        this.imageObserver.unobserve(img);
                    }
                }
            });
        }, {
            rootMargin: '100px 0px',
            threshold: 0.1
        });
        
        // Lazy load components
        this.componentObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const element = entry.target;
                    const componentType = element.dataset.lazyComponent;
                    
                    this.loadComponent(element, componentType);
                    this.componentObserver.unobserve(element);
                }
            });
        }, {
            rootMargin: '200px 0px',
            threshold: 0.1
        });
        
        this.observers.set('images', this.imageObserver);
        this.observers.set('components', this.componentObserver);
    }
    
    /**
     * Enable lazy loading for images
     */
    enableLazyImages() {
        const images = document.querySelectorAll('img[data-src]');
        images.forEach(img => {
            // Add loading placeholder
            img.classList.add('lazy-loading');
            this.imageObserver.observe(img);
        });
    }
    
    /**
     * Enable lazy loading for components
     */
    enableLazyComponents() {
        const components = document.querySelectorAll('[data-lazy-component]');
        components.forEach(component => {
            this.componentObserver.observe(component);
        });
    }
    
    /**
     * Load component dynamically
     */
    async loadComponent(element, componentType) {
        const startTime = performance.now();
        
        try {
            switch (componentType) {
                case 'chart':
                    await this.loadChartComponent(element);
                    break;
                case 'table':
                    await this.loadTableComponent(element);
                    break;
                case 'modal':
                    await this.loadModalComponent(element);
                    break;
                default:
                    console.warn(`Unknown component type: ${componentType}`);
            }
        } catch (error) {
            console.error(`Failed to load component ${componentType}:`, error);
        }
        
        const loadTime = performance.now() - startTime;
        this.metrics.renderTime += loadTime;
    }
    
    /**
     * Load chart component with Chart.js
     */
    async loadChartComponent(element) {
        try {
            console.log('Loading chart component...', element);
            
            if (!window.Chart) {
                console.log('Loading Chart.js from CDN...');
                await this.loadScript('https://cdn.jsdelivr.net/npm/chart.js');
                console.log('Chart.js loaded successfully');
            }
            
            const chartConfigString = element.dataset.chartConfig || '{}';
            console.log('Chart config string:', chartConfigString);
            
            const chartConfig = JSON.parse(chartConfigString);
            console.log('Parsed chart config:', chartConfig);
            
            const canvas = element.querySelector('canvas') || document.createElement('canvas');
            
            if (!element.contains(canvas)) {
                element.appendChild(canvas);
            }
            
            const chart = new Chart(canvas, chartConfig);
            console.log('Chart created successfully:', chart);
            
            element.classList.add('component-loaded');
            
            // Remove loading styles
            element.style.opacity = '1';
            element.style.transform = 'translateY(0)';
            
        } catch (error) {
            console.error('Error loading chart component:', error);
            element.innerHTML = `<div style="display: flex; align-items: center; justify-content: center; height: 200px; color: var(--muted);">
                <div>
                    <div>⚠️ Chart failed to load</div>
                    <div style="font-size: 0.8em; margin-top: 0.5rem;">Error: ${error.message}</div>
                </div>
            </div>`;
            element.classList.add('component-loaded', 'component-error');
        }
    }
    
    /**
     * Load table component with virtual scrolling
     */
    async loadTableComponent(element) {
        const dataSource = element.dataset.dataSource;
        const data = await this.fetchWithCache(dataSource);
        
        this.createVirtualTable(element, data);
        element.classList.add('component-loaded');
    }
    
    /**
     * Load modal component
     */
    async loadModalComponent(element) {
        const modalContent = element.dataset.modalContent;
        if (modalContent) {
            const content = await this.fetchWithCache(modalContent);
            element.innerHTML = content;
        }
        element.classList.add('component-loaded');
    }
    
    /**
     * Virtual scrolling for large lists
     */
    createVirtualTable(container, data) {
        const itemHeight = 60;
        const containerHeight = container.clientHeight || 400;
        const visibleCount = Math.ceil(containerHeight / itemHeight) + 2;
        
        let scrollTop = 0;
        let startIndex = 0;
        
        const viewport = document.createElement('div');
        viewport.className = 'virtual-viewport';
        viewport.style.height = `${containerHeight}px`;
        viewport.style.overflow = 'auto';
        
        const content = document.createElement('div');
        content.className = 'virtual-content';
        content.style.height = `${data.length * itemHeight}px`;
        content.style.position = 'relative';
        
        const renderItems = () => {
            const endIndex = Math.min(startIndex + visibleCount, data.length);
            const items = [];
            
            for (let i = startIndex; i < endIndex; i++) {
                const item = document.createElement('div');
                item.className = 'virtual-item';
                item.style.position = 'absolute';
                item.style.top = `${i * itemHeight}px`;
                item.style.height = `${itemHeight}px`;
                item.style.width = '100%';
                item.innerHTML = this.renderTableRow(data[i]);
                items.push(item);
            }
            
            content.innerHTML = '';
            items.forEach(item => content.appendChild(item));
        };
        
        viewport.addEventListener('scroll', this.debounce(() => {
            scrollTop = viewport.scrollTop;
            startIndex = Math.floor(scrollTop / itemHeight);
            renderItems();
        }, 16)); // 60fps
        
        viewport.appendChild(content);
        container.appendChild(viewport);
        
        renderItems();
    }
    
    /**
     * Render table row (override in specific implementations)
     */
    renderTableRow(rowData) {
        return `<div class="table-row">${JSON.stringify(rowData)}</div>`;
    }
    
    /**
     * Debounced function utility
     */
    debounce(func, delay, key = 'default') {
        return (...args) => {
            const timer = this.debounceTimers.get(key);
            if (timer) clearTimeout(timer);
            
            this.debounceTimers.set(key, setTimeout(() => {
                func.apply(this, args);
                this.debounceTimers.delete(key);
            }, delay));
        };
    }
    
    /**
     * Throttled function utility
     */
    throttle(func, limit) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }
    
    /**
     * Fetch with caching
     */
    async fetchWithCache(url, options = {}) {
        const cacheKey = `${url}-${JSON.stringify(options)}`;
        
        if (this.cache.has(cacheKey)) {
            this.metrics.cacheHits++;
            return this.cache.get(cacheKey);
        }
        
        this.metrics.cacheMisses++;
        
        try {
            const response = await fetch(url, options);
            const data = await response.json();
            
            // Cache for 5 minutes
            this.cache.set(cacheKey, data);
            setTimeout(() => this.cache.delete(cacheKey), 5 * 60 * 1000);
            
            return data;
        } catch (error) {
            console.error(`Fetch failed for ${url}:`, error);
            throw error;
        }
    }
    
    /**
     * Preload critical resources
     */
    preloadCriticalResources() {
        const criticalResources = [
            '/css/design-system.css',
            '/css/components.css',
            '/js/ui-utils.js'
        ];
        
        criticalResources.forEach(resource => {
            const link = document.createElement('link');
            link.rel = 'preload';
            link.href = resource;
            link.as = resource.endsWith('.css') ? 'style' : 'script';
            document.head.appendChild(link);
        });
    }
    
    /**
     * Load external script dynamically
     */
    async loadScript(src) {
        return new Promise((resolve, reject) => {
            if (document.querySelector(`script[src="${src}"]`)) {
                resolve();
                return;
            }
            
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }
    
    /**
     * Optimize event listeners with passive events
     */
    optimizeEventListeners() {
        // Override addEventListener to use passive events for scroll/touch
        const originalAddEventListener = EventTarget.prototype.addEventListener;
        
        EventTarget.prototype.addEventListener = function(type, listener, options) {
            const passiveEvents = ['scroll', 'touchstart', 'touchmove', 'wheel'];
            
            if (passiveEvents.includes(type) && typeof options !== 'object') {
                options = { passive: true };
            } else if (passiveEvents.includes(type) && typeof options === 'object' && !options.hasOwnProperty('passive')) {
                options.passive = true;
            }
            
            return originalAddEventListener.call(this, type, listener, options);
        };
    }
    
    /**
     * Performance monitoring
     */
    setupPerformanceMetrics() {
        // Measure page load time
        window.addEventListener('load', () => {
            this.metrics.loadTime = performance.now();
            this.reportMetrics();
        });
        
        // Measure largest contentful paint
        if ('PerformanceObserver' in window) {
            const observer = new PerformanceObserver((list) => {
                const entries = list.getEntries();
                const lastEntry = entries[entries.length - 1];
                this.metrics.lcp = lastEntry.startTime;
            });
            
            observer.observe({ entryTypes: ['largest-contentful-paint'] });
        }
    }
    
    /**
     * Report performance metrics
     */
    reportMetrics() {
        console.group('🚀 Performance Metrics');
        console.log(`Page Load Time: ${this.metrics.loadTime.toFixed(2)}ms`);
        console.log(`Render Time: ${this.metrics.renderTime.toFixed(2)}ms`);
        console.log(`Cache Hits: ${this.metrics.cacheHits}`);
        console.log(`Cache Misses: ${this.metrics.cacheMisses}`);
        if (this.metrics.lcp) {
            console.log(`Largest Contentful Paint: ${this.metrics.lcp.toFixed(2)}ms`);
        }
        console.groupEnd();
    }
    
    /**
     * Cleanup observers and timers
     */
    destroy() {
        this.observers.forEach(observer => observer.disconnect());
        this.debounceTimers.forEach(timer => clearTimeout(timer));
        this.cache.clear();
    }
}

// Initialize performance optimizer
const performanceOptimizer = new PerformanceOptimizer();

// Export for global use
window.PerformanceOptimizer = PerformanceOptimizer;
window.performanceOptimizer = performanceOptimizer;

// Auto-enable lazy loading when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    performanceOptimizer.enableLazyImages();
    performanceOptimizer.enableLazyComponents();
});

// CSS for lazy loading animations
const lazyLoadingCSS = `
.lazy-loading {
    background: linear-gradient(90deg, var(--hover) 25%, var(--panel) 50%, var(--hover) 75%);
    background-size: 200% 100%;
    animation: loading 1.5s infinite;
}

.lazy-loading.loaded {
    animation: none;
    background: none;
}

@keyframes loading {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
}

.virtual-viewport {
    border: 1px solid var(--hairline);
    border-radius: var(--radius);
}

.virtual-item {
    border-bottom: 1px solid var(--hairline);
    padding: 1rem;
    display: flex;
    align-items: center;
    background: var(--panel);
    transition: background-color var(--transition-fast);
}

.virtual-item:hover {
    background: var(--hover);
}

.component-loaded {
    opacity: 1;
    transform: translateY(0);
    transition: all var(--transition-base);
}

[data-lazy-component] {
    opacity: 0;
    transform: translateY(20px);
    min-height: 200px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--hover);
    border-radius: var(--radius);
    position: relative;
}

[data-lazy-component]::before {
    content: "Loading...";
    color: var(--muted);
    font-size: var(--text-sm);
}

[data-lazy-component].component-loaded::before {
    display: none;
}
`;

// Inject lazy loading CSS
const style = document.createElement('style');
style.textContent = lazyLoadingCSS;
document.head.appendChild(style);