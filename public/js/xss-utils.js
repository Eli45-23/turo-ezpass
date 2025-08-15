/**
 * XSS Prevention Utilities
 * 
 * This module provides secure methods for handling dynamic content rendering
 * to prevent Cross-Site Scripting (XSS) attacks.
 */

// HTML entity encoding map
const HTML_ENTITIES = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;'
};

/**
 * Escape HTML entities in user input
 */
function escapeHtml(input) {
    if (typeof input !== 'string') {
        return input;
    }
    return input.replace(/[&<>"'/]/g, char => HTML_ENTITIES[char]);
}

/**
 * Safely set text content (no HTML parsing)
 */
function safeSetText(element, text) {
    if (!element) return;
    
    // Use textContent instead of innerHTML to prevent HTML parsing
    element.textContent = text || '';
}

/**
 * Safely set HTML content with sanitization
 */
function safeSetHTML(element, html) {
    if (!element) return;
    
    // Escape any potentially dangerous content
    const safeHTML = escapeHtml(html || '');
    element.innerHTML = safeHTML;
}

/**
 * Create safe HTML template with escaped values
 */
function createSafeTemplate(template, data) {
    if (!template || !data) return '';
    
    // Escape all data values
    const safeData = {};
    for (const key in data) {
        if (data.hasOwnProperty(key)) {
            safeData[key] = escapeHtml(String(data[key] || ''));
        }
    }
    
    // Replace template variables with escaped values
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
        return safeData[key] || '';
    });
}

/**
 * Safely render a table row with user data
 */
function createSafeTableRow(rowData, columns) {
    if (!rowData || !columns) return '';
    
    const cells = columns.map(column => {
        let value = rowData[column.field] || '';
        
        // Apply column-specific formatting if provided
        if (column.formatter && typeof column.formatter === 'function') {
            value = column.formatter(value);
        }
        
        // Always escape the final value
        const escapedValue = escapeHtml(String(value));
        const className = column.className ? ` class="${escapeHtml(column.className)}"` : '';
        
        return `<td${className}>${escapedValue}</td>`;
    }).join('');
    
    return `<tr>${cells}</tr>`;
}

/**
 * Safely update DOM elements with user data
 */
function safeUpdateElement(elementId, content, options = {}) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    if (options.asText || typeof content === 'string') {
        // Safe text content update
        safeSetText(element, content);
    } else if (options.asHTML) {
        // Safe HTML content update with escaping
        safeSetHTML(element, content);
    } else {
        // Default to safe text
        safeSetText(element, content);
    }
}

/**
 * Safely populate a table with user data
 */
function safePopulateTable(tableId, data, columns) {
    const table = document.getElementById(tableId);
    if (!table) return;
    
    const tbody = table.querySelector('tbody');
    if (!tbody) return;
    
    if (!data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${columns.length}">No data available</td></tr>`;
        return;
    }
    
    const rows = data.map(rowData => createSafeTableRow(rowData, columns)).join('');
    tbody.innerHTML = rows;
}

/**
 * Create a safe badge/status element
 */
function createSafeBadge(text, type = 'default') {
    const validTypes = ['default', 'success', 'danger', 'warning', 'info'];
    const safeType = validTypes.includes(type) ? type : 'default';
    const safeText = escapeHtml(String(text || ''));
    
    return `<span class="badge badge-${safeType}">${safeText}</span>`;
}

/**
 * Sanitize URL to prevent javascript: protocol injection
 */
function sanitizeUrl(url) {
    if (!url || typeof url !== 'string') return '#';
    
    // Remove dangerous protocols
    const dangerousProtocols = ['javascript:', 'data:', 'vbscript:', 'file:'];
    const lowerUrl = url.toLowerCase().trim();
    
    for (const protocol of dangerousProtocols) {
        if (lowerUrl.startsWith(protocol)) {
            return '#';
        }
    }
    
    // Allow relative URLs, http, https, mailto
    if (url.startsWith('/') || 
        url.startsWith('http://') || 
        url.startsWith('https://') || 
        url.startsWith('mailto:')) {
        return url;
    }
    
    // For anything else, prepend with http://
    return url.startsWith('www.') ? `http://${url}` : '#';
}

/**
 * Safely create a link element
 */
function createSafeLink(url, text, className = '') {
    const safeUrl = sanitizeUrl(url);
    const safeText = escapeHtml(String(text || ''));
    const safeClassName = className ? ` class="${escapeHtml(className)}"` : '';
    
    return `<a href="${safeUrl}"${safeClassName}>${safeText}</a>`;
}

/**
 * Clean and validate form input
 */
function cleanFormInput(input) {
    if (typeof input !== 'string') return input;
    
    // Remove null bytes and control characters
    return input.replace(/[\0\x08\x09\x1a\n\r"'\\\%]/g, '').trim();
}

/**
 * Safely display user messages/notifications
 */
function showSafeMessage(containerId, message, type = 'info') {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const validTypes = ['success', 'error', 'warning', 'info'];
    const safeType = validTypes.includes(type) ? type : 'info';
    const safeMessage = escapeHtml(String(message || ''));
    
    container.innerHTML = `
        <div class="message message-${safeType}">
            <span class="message-text">${safeMessage}</span>
        </div>
    `;
}

// Export functions for use
if (typeof window !== 'undefined') {
    window.XSSUtils = {
        escapeHtml,
        safeSetText,
        safeSetHTML,
        createSafeTemplate,
        createSafeTableRow,
        safeUpdateElement,
        safePopulateTable,
        createSafeBadge,
        sanitizeUrl,
        createSafeLink,
        cleanFormInput,
        showSafeMessage
    };
}