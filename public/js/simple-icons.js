// Simple local icon system to replace external CDN dependencies
// This provides basic icons using Unicode symbols and simple SVG

window.simpleIcons = {
    // Icon mapping from Lucide names to Unicode/SVG alternatives
    icons: {
        'bar-chart-3': '📊',
        'route': '🛣️',
        'upload': '📤',
        'activity': '📈',
        'radio': '📻',
        'file-text': '📄',
        'database': '🗄️',
        'log-out': '🚪',
        'cpu': '🖥️',
        'menu': '☰',
        'x': '✕',
        'check': '✓',
        'arrow-right': '→',
        'arrow-left': '←',
        'plus': '+',
        'minus': '−',
        'search': '🔍',
        'settings': '⚙️',
        'user': '👤',
        'home': '🏠',
        'refresh': '🔄',
        // Missing dashboard icons
        'layout-dashboard': '📊',
        'map': '🗺️',
        'table': '📋'
    },
    
    // Simple SVG icons for better visual consistency
    svgIcons: {
        'bar-chart-3': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><rect x="7" y="10" width="3" height="11"/><rect x="12" y="6" width="3" height="15"/><rect x="17" y="13" width="3" height="8"/></svg>',
        'route': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="19" r="3"/><path d="m9 19 8.5-8.5a5 5 0 0 0 0-7l-3-3a5 5 0 0 0-7 0l-8.5 8.5"/></svg>',
        'upload': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7,10 12,5 17,10"/><line x1="12" x2="12" y1="5" y2="15"/></svg>',
        'activity': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',
        'radio': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14"/></svg>',
        'file-text': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><polyline points="10,9 9,9 8,9"/></svg>',
        'database': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>',
        'log-out': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16,17 21,12 16,7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>',
        'cpu': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v3m6-3v3M9 20v3m6-3v3M20 9h3m-3 6h3M1 9h3m-3 6h3"/></svg>',
        'menu': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="18" y2="18"/></svg>',
        'x': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="M6 6l12 12"/></svg>',
        // Missing dashboard SVG icons
        'layout-dashboard': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>',
        'map': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="3,6 9,3 15,6 21,3 21,18 15,21 9,18 3,21"/><line x1="9" x2="9" y1="3" y2="18"/><line x1="15" x2="15" y1="6" y2="21"/></svg>',
        'table': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M21 9H3M21 15H3M12 3v18"/></svg>'
    },
    
    // Initialize icons by replacing data-lucide attributes
    createIcons() {
        const iconElements = document.querySelectorAll('[data-lucide]');
        
        iconElements.forEach(element => {
            const iconName = element.getAttribute('data-lucide');
            
            // Try SVG first for better visual consistency, fallback to Unicode
            if (this.svgIcons[iconName]) {
                element.innerHTML = this.svgIcons[iconName];
                element.style.display = 'inline-block';
                element.style.verticalAlign = 'middle';
            } else if (this.icons[iconName]) {
                element.innerHTML = this.icons[iconName];
                element.style.fontSize = '16px';
                element.style.display = 'inline-block';
                element.style.verticalAlign = 'middle';
            } else {
                // Fallback for unknown icons
                console.warn(`⚠️ Unknown icon: ${iconName}`);
                element.innerHTML = '●';
            }
            
            // Remove the data-lucide attribute
            element.removeAttribute('data-lucide');
        });
        
        console.log(`✅ Replaced ${iconElements.length} icons with local alternatives`);
    }
};

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.simpleIcons.createIcons();
    });
} else {
    window.simpleIcons.createIcons();
}

// Provide backward compatibility with Lucide API
window.lucide = {
    createIcons: () => window.simpleIcons.createIcons()
};