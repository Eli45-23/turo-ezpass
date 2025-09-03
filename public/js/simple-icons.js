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
        'table': '📋',
        'check-circle': '✅',
        'clock': '⏰',
        'calendar': '📅',
        'alert-circle': '⚠️',
        'download': '⬇️',
        'help-circle': '❓',
        'chevron-down': '⌄',
        // Icons causing console warnings
        'info-circle': 'ℹ️',
        'zap-circle': '⚡',
        'shuffle-horizontal': '⇄',
        'triangle-alert': '⚠️',
        // Additional missing icons from codebase
        'car': '🚗',
        'map-pin': '📍',
        'trash-2': '🗑️',
        'play': '▶️',
        'credit-card': '💳',
        'pause-circle': '⏸️',
        'x-circle': '❌',
        'refresh-cw': '🔄',
        'edit': '✏️',
        'pause': '⏸️',
        'chevron-up': '⌃',
        'check-square': '☑️',
        'dollar-sign': '$',
        'eye': '👁️',
        'undo-2': '↶'
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
        'table': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M21 9H3M21 15H3M12 3v18"/></svg>',
        'check-circle': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4"/></svg>',
        'clock': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>',
        'calendar': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>',
        'alert-circle': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>',
        'download': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>',
        'help-circle': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>',
        'chevron-down': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6,9 12,15 18,9"/></svg>',
        // Icons causing console warnings - SVG versions
        'info-circle': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12.01" y1="12" y2="12"/></svg>',
        'zap-circle': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polygon points="10,8 16,12 10,16 10,8"/></svg>',
        'shuffle-horizontal': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="21,16 16,21 16,19"/><polyline points="15,15 21,9 16,4"/><path d="M4 20 L8 20 L10.5 18"/><path d="M15 15 L20 20"/><path d="M4 4 L8 4 L10.5 6"/></svg>',
        'triangle-alert': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>',
        // Additional missing icons from codebase - SVG versions
        'car': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9L18.7 9H5.3L3.5 11.1C2.7 11.3 2 12.1 2 13v3c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/></svg>',
        'map-pin': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>',
        'trash-2': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>',
        'play': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5,3 19,12 5,21 5,3"/></svg>',
        'credit-card': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" x2="23" y1="10" y2="10"/></svg>',
        'pause-circle': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="10" x2="10" y1="15" y2="9"/><line x1="14" x2="14" y1="15" y2="9"/></svg>',
        'x-circle': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6"/><path d="M9 9l6 6"/></svg>',
        'refresh-cw': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/></svg>',
        'edit': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg>',
        'pause': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>',
        'chevron-up': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18,15 12,9 6,15"/></svg>',
        'check-square': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9,11 12,14 22,4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
        'dollar-sign': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" x2="12" y1="1" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
        'eye': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
        'undo-2': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11"/></svg>'
    },
    
    // SVG templates without hardcoded width/height for dynamic sizing
    svgTemplates: {
        'bar-chart-3': '<path d="M3 3v18h18"/><rect x="7" y="10" width="3" height="11"/><rect x="12" y="6" width="3" height="15"/><rect x="17" y="13" width="3" height="8"/>',
        'route': '<circle cx="6" cy="19" r="3"/><path d="m9 19 8.5-8.5a5 5 0 0 0 0-7l-3-3a5 5 0 0 0-7 0l-8.5 8.5"/>',
        'upload': '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7,10 12,5 17,10"/><line x1="12" x2="12" y1="5" y2="15"/>',
        'activity': '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
        'radio': '<circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14"/>',
        'file-text': '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><polyline points="10,9 9,9 8,9"/>',
        'database': '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>',
        'log-out': '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16,17 21,12 16,7"/><line x1="21" x2="9" y1="12" y2="12"/>',
        'cpu': '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v3m6-3v3M9 20v3m6-3v3M20 9h3m-3 6h3M1 9h3m-3 6h3"/>',
        'menu': '<line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="18" y2="18"/>',
        'x': '<path d="M18 6 6 18"/><path d="M6 6l12 12"/>',
        'layout-dashboard': '<rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/>',
        'map': '<polygon points="3,6 9,3 15,6 21,3 21,18 15,21 9,18 3,21"/><line x1="9" x2="9" y1="3" y2="18"/><line x1="15" x2="15" y1="6" y2="21"/>',
        'table': '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M21 9H3M21 15H3M12 3v18"/>',
        'check-circle': '<circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4"/>',
        'clock': '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
        'calendar': '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/>',
        'alert-circle': '<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>',
        'download': '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" x2="12" y1="15" y2="3"/>',
        'help-circle': '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" x2="12.01" y1="17" y2="17"/>',
        'chevron-down': '<polyline points="6,9 12,15 18,9"/>',
        'info-circle': '<circle cx="12" cy="12" r="10"/><line x1="12" x2="12.01" y1="12" y2="12"/>',
        'zap-circle': '<circle cx="12" cy="12" r="10"/><polygon points="10,8 16,12 10,16 10,8"/>',
        'shuffle-horizontal': '<polyline points="21,16 16,21 16,19"/><polyline points="15,15 21,9 16,4"/><path d="M4 20 L8 20 L10.5 18"/><path d="M15 15 L20 20"/><path d="M4 4 L8 4 L10.5 6"/>',
        'triangle-alert': '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/>',
        'car': '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9L18.7 9H5.3L3.5 11.1C2.7 11.3 2 12.1 2 13v3c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>',
        'map-pin': '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
        'trash-2': '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>',
        'play': '<polygon points="5,3 19,12 5,21 5,3"/>',
        'credit-card': '<rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" x2="23" y1="10" y2="10"/>',
        'pause-circle': '<circle cx="12" cy="12" r="10"/><line x1="10" x2="10" y1="15" y2="9"/><line x1="14" x2="14" y1="15" y2="9"/>',
        'x-circle': '<circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6"/><path d="M9 9l6 6"/>',
        'refresh-cw': '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/>',
        'edit': '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z"/>',
        'pause': '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>',
        'chevron-up': '<polyline points="18,15 12,9 6,15"/>',
        'check-square': '<polyline points="9,11 12,14 22,4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
        'dollar-sign': '<line x1="12" x2="12" y1="1" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
        'eye': '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
        'undo-2': '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11"/>',
        'settings': '<circle cx="12" cy="12" r="3"/><path d="M12 1v6M12 17v6M4.2 4.2l4.2 4.2M15.6 15.6l4.2 4.2M1 12h6M17 12h6M4.2 19.8l4.2-4.2M15.6 8.4l4.2-4.2"/>',
        'user': '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
        'plus': '<path d="M12 5v14M5 12h14"/>',
        'check': '<polyline points="20,6 9,17 4,12"/>'
    },
    
    // Helper function to extract size from Tailwind classes
    getSizeFromClasses(element) {
        const className = element.className;
        const sizeMatch = className.match(/w-(\d+)\s+h-(\d+)/);
        
        if (sizeMatch) {
            const widthClass = parseInt(sizeMatch[1]);
            const heightClass = parseInt(sizeMatch[2]);
            
            // Map Tailwind classes to pixel values
            const sizeMap = {
                3: 12,   // w-3 h-3 = 12px
                4: 16,   // w-4 h-4 = 16px 
                5: 20,   // w-5 h-5 = 20px
                6: 24,   // w-6 h-6 = 24px
                7: 28,   // w-7 h-7 = 28px
                16: 64   // w-16 h-16 = 64px
            };
            
            const width = sizeMap[widthClass] || 16;
            const height = sizeMap[heightClass] || 16;
            return { width, height };
        }
        
        // Default size if no classes found
        return { width: 16, height: 16 };
    },
    
    // Helper function to generate SVG with dynamic sizing
    generateDynamicSVG(iconName, width, height) {
        // Get the base SVG template (without hardcoded width/height)
        const svgTemplate = this.svgTemplates[iconName];
        if (svgTemplate) {
            return `<svg width="${width}" height="${height}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${svgTemplate}</svg>`;
        }
        return null;
    },

    // Initialize icons by replacing data-lucide attributes
    createIcons() {
        const iconElements = document.querySelectorAll('[data-lucide]');
        
        iconElements.forEach(element => {
            const iconName = element.getAttribute('data-lucide');
            const { width, height } = this.getSizeFromClasses(element);
            
            // Try SVG with dynamic sizing first
            const dynamicSVG = this.generateDynamicSVG(iconName, width, height);
            if (dynamicSVG) {
                element.innerHTML = dynamicSVG;
                element.style.display = 'inline-block';
                element.style.verticalAlign = 'middle';
            } else if (this.icons[iconName]) {
                // Fallback to Unicode with appropriate font size
                element.innerHTML = this.icons[iconName];
                element.style.fontSize = `${Math.max(width, height)}px`;
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