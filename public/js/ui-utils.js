/* ==============================================
   TURO TOLL TRACKER - UI UTILITIES
   Safe DOM manipulation and helper functions
   ============================================== */

/* ==============================================
   SAFE DOM UTILITIES
   ============================================== */

/**
 * Safely update element text content
 * @param {string} id - Element ID
 * @param {string} text - Text content to set
 * @param {string} fallback - Fallback text if element not found
 */
function updateEl(id, text, fallback = '') {
  const el = document.getElementById(id);
  if (!el) {
    console.warn(`#${id} missing`);
    return false;
  }
  el.textContent = text || fallback;
  return true;
}

/**
 * Safely update element HTML content
 * @param {string} id - Element ID
 * @param {string} html - HTML content to set
 * @param {string} fallback - Fallback HTML if element not found
 */
function updateHTML(id, html, fallback = '') {
  const el = document.getElementById(id);
  if (!el) {
    console.warn(`#${id} missing`);
    return false;
  }
  el.innerHTML = html || fallback;
  return true;
}

/**
 * Safely get element by ID
 * @param {string} id - Element ID
 * @returns {Element|null}
 */
function getEl(id) {
  const el = document.getElementById(id);
  if (!el) {
    console.warn(`#${id} missing`);
  }
  return el;
}

/**
 * Safely add event listener with error handling
 * @param {string} id - Element ID
 * @param {string} event - Event type
 * @param {Function} handler - Event handler
 */
function addListener(id, event, handler) {
  const el = getEl(id);
  if (el && typeof handler === 'function') {
    el.addEventListener(event, (e) => {
      try {
        handler(e);
      } catch (error) {
        console.error(`Error in ${event} handler for #${id}:`, error);
        showNotification({
          type: 'error',
          title: 'Error',
          message: 'An unexpected error occurred. Please try again.'
        });
      }
    });
    return true;
  }
  return false;
}

/**
 * Safely toggle element visibility
 * @param {string} id - Element ID
 * @param {boolean} show - Whether to show or hide
 */
function toggleElement(id, show = null) {
  const el = getEl(id);
  if (!el) return false;
  
  if (show === null) {
    el.style.display = el.style.display === 'none' ? '' : 'none';
  } else {
    el.style.display = show ? '' : 'none';
  }
  return true;
}

/**
 * Safely add/remove CSS classes
 * @param {string} id - Element ID
 * @param {string|Array} classes - Class names to toggle
 * @param {boolean} add - Whether to add or remove classes
 */
function toggleClass(id, classes, add = null) {
  const el = getEl(id);
  if (!el) return false;
  
  const classList = Array.isArray(classes) ? classes : [classes];
  
  classList.forEach(className => {
    if (add === null) {
      el.classList.toggle(className);
    } else if (add) {
      el.classList.add(className);
    } else {
      el.classList.remove(className);
    }
  });
  
  return true;
}

/* ==============================================
   NOTIFICATION SYSTEM
   ============================================== */

/**
 * Safe notification system (prevents console errors)
 * @param {Object} options - Notification options
 * @param {string} options.type - Notification type: 'success', 'error', 'warning', 'info'
 * @param {string} options.title - Notification title
 * @param {string} options.message - Notification message
 * @param {number} options.duration - Auto-hide duration in ms (0 = no auto-hide)
 */
window.showNotification = window.showNotification || function({
  type = 'info',
  title = '',
  message = '',
  duration = 5000
} = {}) {
  // Fallback to console if no UI notification system
  const logMethod = type === 'error' ? 'error' : type === 'warning' ? 'warn' : 'log';
  console[logMethod](`${title} ${message}`.trim());
  
  // Try to show UI notification
  try {
    const notification = createNotification({ type, title, message, duration });
    showUINotification(notification);
  } catch (error) {
    console.warn('UI notification failed, using console only:', error);
  }
};

/**
 * Create notification element
 */
function createNotification({ type, title, message, duration }) {
  const notification = document.createElement('div');
  notification.className = `toast alert alert-${type} show`;
  notification.setAttribute('role', 'alert');
  notification.setAttribute('aria-live', 'polite');
  
  const icon = getNotificationIcon(type);
  
  notification.innerHTML = `
    <div class="flex items-center gap-3">
      <span class="notification-icon">${icon}</span>
      <div class="flex-1">
        ${title ? `<div class="font-semibold">${escapeHTML(title)}</div>` : ''}
        ${message ? `<div class="text-sm">${escapeHTML(message)}</div>` : ''}
      </div>
      <button class="notification-close btn-icon btn-ghost" aria-label="Close notification">
        <span aria-hidden="true">&times;</span>
      </button>
    </div>
  `;
  
  // Add close functionality
  const closeBtn = notification.querySelector('.notification-close');
  closeBtn.addEventListener('click', () => hideNotification(notification));
  
  // Auto-hide if duration specified
  if (duration > 0) {
    setTimeout(() => hideNotification(notification), duration);
  }
  
  return notification;
}

/**
 * Show UI notification
 */
function showUINotification(notification) {
  // Create container if it doesn't exist
  let container = document.getElementById('notification-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'notification-container';
    container.className = 'fixed top-4 right-4 z-50 flex flex-col gap-2';
    container.style.zIndex = 'var(--z-toast)';
    document.body.appendChild(container);
  }
  
  container.appendChild(notification);
  
  // Trigger animation
  requestAnimationFrame(() => {
    notification.classList.add('show');
  });
}

/**
 * Hide notification
 */
function hideNotification(notification) {
  notification.classList.remove('show');
  setTimeout(() => {
    if (notification.parentNode) {
      notification.parentNode.removeChild(notification);
    }
  }, 300);
}

/**
 * Get notification icon
 */
function getNotificationIcon(type) {
  const icons = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️'
  };
  return icons[type] || icons.info;
}

/* ==============================================
   FORM UTILITIES
   ============================================== */

/**
 * Safely get form data as object
 * @param {string} formId - Form element ID
 * @returns {Object|null}
 */
function getFormData(formId) {
  const form = getEl(formId);
  if (!form) return null;
  
  const formData = new FormData(form);
  const data = {};
  
  for (const [key, value] of formData.entries()) {
    if (data[key]) {
      // Handle multiple values (checkboxes, etc.)
      if (Array.isArray(data[key])) {
        data[key].push(value);
      } else {
        data[key] = [data[key], value];
      }
    } else {
      data[key] = value;
    }
  }
  
  return data;
}

/**
 * Safely set form field values
 * @param {string} formId - Form element ID
 * @param {Object} data - Data to populate
 */
function setFormData(formId, data) {
  const form = getEl(formId);
  if (!form || !data) return false;
  
  Object.entries(data).forEach(([key, value]) => {
    const field = form.querySelector(`[name="${key}"]`);
    if (field) {
      if (field.type === 'checkbox' || field.type === 'radio') {
        field.checked = Boolean(value);
      } else {
        field.value = value || '';
      }
    }
  });
  
  return true;
}

/**
 * Validate form with custom rules
 * @param {string} formId - Form element ID
 * @param {Object} rules - Validation rules
 * @returns {Object} Validation result
 */
function validateForm(formId, rules = {}) {
  const form = getEl(formId);
  if (!form) return { valid: false, errors: ['Form not found'] };
  
  const data = getFormData(formId);
  const errors = [];
  
  Object.entries(rules).forEach(([field, rule]) => {
    const value = data[field];
    
    if (rule.required && (!value || value.toString().trim() === '')) {
      errors.push(`${rule.label || field} is required`);
    }
    
    if (value && rule.pattern && !rule.pattern.test(value)) {
      errors.push(`${rule.label || field} format is invalid`);
    }
    
    if (value && rule.minLength && value.length < rule.minLength) {
      errors.push(`${rule.label || field} must be at least ${rule.minLength} characters`);
    }
    
    if (value && rule.maxLength && value.length > rule.maxLength) {
      errors.push(`${rule.label || field} must be no more than ${rule.maxLength} characters`);
    }
    
    if (rule.custom && typeof rule.custom === 'function') {
      const customError = rule.custom(value, data);
      if (customError) {
        errors.push(customError);
      }
    }
  });
  
  return {
    valid: errors.length === 0,
    errors,
    data
  };
}

/* ==============================================
   MODAL UTILITIES
   ============================================== */

/**
 * Show modal
 * @param {string} modalId - Modal element ID
 */
function showModal(modalId) {
  const modal = getEl(modalId);
  const backdrop = getEl(`${modalId}-backdrop`) || createModalBackdrop(modalId);
  
  if (!modal) return false;
  
  // Show backdrop
  backdrop.classList.add('show');
  modal.classList.add('show');
  
  // Focus management
  const firstFocusable = modal.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
  if (firstFocusable) {
    firstFocusable.focus();
  }
  
  // Escape key handler
  const escapeHandler = (e) => {
    if (e.key === 'Escape') {
      hideModal(modalId);
      document.removeEventListener('keydown', escapeHandler);
    }
  };
  document.addEventListener('keydown', escapeHandler);
  
  return true;
}

/**
 * Hide modal
 * @param {string} modalId - Modal element ID
 */
function hideModal(modalId) {
  const modal = getEl(modalId);
  const backdrop = getEl(`${modalId}-backdrop`);
  
  if (modal) modal.classList.remove('show');
  if (backdrop) backdrop.classList.remove('show');
  
  // Return focus to trigger element if available
  const trigger = document.querySelector(`[data-modal="${modalId}"]`);
  if (trigger) trigger.focus();
  
  return true;
}

/**
 * Create modal backdrop
 */
function createModalBackdrop(modalId) {
  const backdrop = document.createElement('div');
  backdrop.id = `${modalId}-backdrop`;
  backdrop.className = 'modal-backdrop';
  backdrop.addEventListener('click', () => hideModal(modalId));
  document.body.appendChild(backdrop);
  return backdrop;
}

/* ==============================================
   TABLE UTILITIES
   ============================================== */

/**
 * Create sortable table
 * @param {string} tableId - Table element ID
 * @param {Object} options - Sort options
 */
function makeSortableTable(tableId, options = {}) {
  const table = getEl(tableId);
  if (!table) return false;
  
  const headers = table.querySelectorAll('th[data-sort]');
  let currentSort = { column: null, direction: 'asc' };
  
  headers.forEach(header => {
    header.style.cursor = 'pointer';
    header.addEventListener('click', () => {
      const column = header.dataset.sort;
      const direction = currentSort.column === column && currentSort.direction === 'asc' ? 'desc' : 'asc';
      
      sortTable(table, column, direction);
      currentSort = { column, direction };
      
      // Update UI
      headers.forEach(h => h.classList.remove('sort-asc', 'sort-desc'));
      header.classList.add(`sort-${direction}`);
    });
  });
  
  return true;
}

/**
 * Sort table by column
 */
function sortTable(table, column, direction = 'asc') {
  const tbody = table.querySelector('tbody');
  if (!tbody) return;
  
  const rows = Array.from(tbody.querySelectorAll('tr'));
  const sortedRows = rows.sort((a, b) => {
    const aCell = a.querySelector(`[data-sort="${column}"]`);
    const bCell = b.querySelector(`[data-sort="${column}"]`);
    
    if (!aCell || !bCell) return 0;
    
    let aValue = aCell.textContent.trim();
    let bValue = bCell.textContent.trim();
    
    // Handle numbers
    if (!isNaN(aValue) && !isNaN(bValue)) {
      aValue = parseFloat(aValue);
      bValue = parseFloat(bValue);
    }
    
    // Handle dates
    if (aCell.dataset.timestamp) {
      aValue = parseInt(aCell.dataset.timestamp);
      bValue = parseInt(bCell.dataset.timestamp);
    }
    
    let result = 0;
    if (aValue < bValue) result = -1;
    if (aValue > bValue) result = 1;
    
    return direction === 'desc' ? -result : result;
  });
  
  // Re-append sorted rows
  sortedRows.forEach(row => tbody.appendChild(row));
}

/* ==============================================
   CHART UTILITIES
   ============================================== */

/**
 * Create responsive chart container
 * @param {string} canvasId - Canvas element ID
 * @param {Object} config - Chart.js config
 */
function createChart(canvasId, config) {
  const canvas = getEl(canvasId);
  if (!canvas || typeof Chart === 'undefined') {
    console.warn('Chart.js not available or canvas not found');
    return null;
  }
  
  // Apply theme colors to chart
  const themedConfig = applyChartTheme(config);
  
  try {
    return new Chart(canvas.getContext('2d'), themedConfig);
  } catch (error) {
    console.error('Failed to create chart:', error);
    showNotification({
      type: 'error',
      title: 'Chart Error',
      message: 'Failed to create chart visualization'
    });
    return null;
  }
}

/**
 * Apply design system theme to chart config
 */
function applyChartTheme(config) {
  const theme = {
    backgroundColor: 'rgba(34, 211, 238, 0.1)',
    borderColor: '#22D3EE',
    gridColor: '#24304A',
    textColor: '#E6ECF8',
    mutedColor: '#9FB0D8'
  };
  
  // Apply theme recursively
  return JSON.parse(JSON.stringify(config).replace(
    /"--theme-(\w+)"/g,
    (match, key) => `"${theme[key] || match}"`
  ));
}

/* ==============================================
   UTILITY FUNCTIONS
   ============================================== */

/**
 * Debounce function calls
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in ms
 * @returns {Function}
 */
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Throttle function calls
 * @param {Function} func - Function to throttle
 * @param {number} limit - Limit in ms
 * @returns {Function}
 */
function throttle(func, limit) {
  let inThrottle;
  return function executedFunction(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

/**
 * Format currency
 * @param {number} amount - Amount to format
 * @param {string} currency - Currency code
 * @returns {string}
 */
function formatCurrency(amount, currency = 'USD') {
  if (typeof amount !== 'number') return '$0.00';
  
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2
  }).format(amount);
}

/**
 * Format date
 * @param {Date|string|number} date - Date to format
 * @param {Object} options - Format options
 * @returns {string}
 */
function formatDate(date, options = {}) {
  if (!date) return '';
  
  const dateObj = new Date(date);
  if (isNaN(dateObj.getTime())) return '';
  
  const defaultOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...options
  };
  
  return new Intl.DateTimeFormat('en-US', defaultOptions).format(dateObj);
}

/**
 * Escape HTML to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string}
 */
function escapeHTML(text) {
  if (typeof text !== 'string') return '';
  
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Copy text to clipboard
 * @param {string} text - Text to copy
 * @returns {Promise<boolean>}
 */
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    showNotification({
      type: 'success',
      title: 'Copied',
      message: 'Text copied to clipboard'
    });
    return true;
  } catch (error) {
    console.error('Failed to copy text:', error);
    showNotification({
      type: 'error',
      title: 'Copy Failed',
      message: 'Failed to copy text to clipboard'
    });
    return false;
  }
}

/**
 * Get URL parameters
 * @returns {Object}
 */
function getURLParams() {
  const params = new URLSearchParams(window.location.search);
  const result = {};
  
  for (const [key, value] of params.entries()) {
    result[key] = value;
  }
  
  return result;
}

/**
 * Set URL parameter without page reload
 * @param {string} key - Parameter key
 * @param {string} value - Parameter value
 */
function setURLParam(key, value) {
  const url = new URL(window.location);
  if (value === null || value === undefined || value === '') {
    url.searchParams.delete(key);
  } else {
    url.searchParams.set(key, value);
  }
  window.history.replaceState({}, '', url);
}

/* ==============================================
   PERFORMANCE UTILITIES
   ============================================== */

/**
 * Lazy load images
 */
function setupLazyLoading() {
  if ('IntersectionObserver' in window) {
    const imageObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          img.src = img.dataset.src;
          img.classList.remove('lazy');
          imageObserver.unobserve(img);
        }
      });
    });
    
    document.querySelectorAll('img[data-src]').forEach(img => {
      imageObserver.observe(img);
    });
  }
}

/**
 * Initialize performance monitoring
 */
function initPerformanceMonitoring() {
  if ('PerformanceObserver' in window) {
    const observer = new PerformanceObserver((list) => {
      list.getEntries().forEach(entry => {
        if (entry.entryType === 'navigation') {
          console.log('Page load time:', entry.loadEventEnd - entry.loadEventStart);
        }
      });
    });
    
    observer.observe({ entryTypes: ['navigation'] });
  }
}

/* ==============================================
   INITIALIZATION
   ============================================== */

// Initialize utilities when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeUI);
} else {
  initializeUI();
}

function initializeUI() {
  setupLazyLoading();
  initPerformanceMonitoring();
  
  // Set up global error handling
  window.addEventListener('error', (event) => {
    console.error('Global error:', event.error);
    showNotification({
      type: 'error',
      title: 'Error',
      message: 'An unexpected error occurred. Please refresh the page if issues persist.'
    });
  });
  
  // Set up accessibility helpers
  document.addEventListener('keydown', (e) => {
    // Skip links navigation
    if (e.key === 'Tab' && e.shiftKey && document.activeElement === document.body) {
      const skipLink = document.querySelector('.skip-link');
      if (skipLink) skipLink.focus();
    }
  });
  
  console.log('UI utilities initialized');
}