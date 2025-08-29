/**
 * Accessibility Enhancement Module
 * 
 * Provides dynamic accessibility features including:
 * - Focus management
 * - ARIA live regions
 * - Keyboard navigation
 * - Screen reader announcements
 * - Form validation accessibility
 */

class AccessibilityManager {
    constructor() {
        this.liveRegion = null;
        this.focusHistory = [];
        this.init();
    }

    init() {
        this.createLiveRegion();
        this.setupFocusManagement();
        this.setupKeyboardNavigation();
        this.setupFormAccessibility();
        this.setupProgressAnnouncements();
        this.setupModalAccessibility();
        console.log('✓ Accessibility manager initialized');
    }

    /**
     * Create ARIA live region for screen reader announcements
     */
    createLiveRegion() {
        this.liveRegion = document.createElement('div');
        this.liveRegion.setAttribute('aria-live', 'polite');
        this.liveRegion.setAttribute('aria-atomic', 'true');
        this.liveRegion.className = 'live-region polite';
        this.liveRegion.id = 'accessibility-announcements';
        document.body.appendChild(this.liveRegion);

        // Create assertive live region for urgent announcements
        this.assertiveLiveRegion = document.createElement('div');
        this.assertiveLiveRegion.setAttribute('aria-live', 'assertive');
        this.assertiveLiveRegion.setAttribute('aria-atomic', 'true');
        this.assertiveLiveRegion.className = 'live-region assertive';
        this.assertiveLiveRegion.id = 'accessibility-alerts';
        document.body.appendChild(this.assertiveLiveRegion);
    }

    /**
     * Announce message to screen readers
     */
    announce(message, assertive = false) {
        const region = assertive ? this.assertiveLiveRegion : this.liveRegion;
        
        // Clear and set message
        region.textContent = '';
        setTimeout(() => {
            region.textContent = message;
        }, 100);
        
        // Clear after announcement
        setTimeout(() => {
            region.textContent = '';
        }, 5000);
    }

    /**
     * Setup focus management
     */
    setupFocusManagement() {
        // Track focus history for complex navigation
        document.addEventListener('focusin', (e) => {
            this.focusHistory.push(e.target);
            if (this.focusHistory.length > 10) {
                this.focusHistory.shift();
            }
        });

        // Skip links functionality
        this.addSkipLinks();

        // Focus trap for modals
        this.setupFocusTrap();
    }

    /**
     * Add skip navigation links (disabled for dashboard)
     */
    addSkipLinks() {
        // Skip links disabled for dashboard interface
        // Ensure main content and navigation have proper IDs for other accessibility features
        const mainContent = document.querySelector('.main-content, main');
        if (mainContent && !mainContent.id) {
            mainContent.id = 'main-content';
        }

        const nav = document.querySelector('.sidebar, nav, .menu');
        if (nav && !nav.id) {
            nav.id = 'navigation';
        }
    }

    /**
     * Setup focus trap for modals and overlays
     */
    setupFocusTrap() {
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                const modal = document.querySelector('[role="dialog"]:not([hidden]), .modal.active');
                if (modal) {
                    this.trapFocus(e, modal);
                }
            }
        });
    }

    /**
     * Trap focus within a container
     */
    trapFocus(event, container) {
        const focusableElements = container.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (event.shiftKey) {
            if (document.activeElement === firstElement) {
                event.preventDefault();
                lastElement.focus();
            }
        } else {
            if (document.activeElement === lastElement) {
                event.preventDefault();
                firstElement.focus();
            }
        }
    }

    /**
     * Setup keyboard navigation enhancements
     */
    setupKeyboardNavigation() {
        // Arrow key navigation for tab-like interfaces
        document.addEventListener('keydown', (e) => {
            const activeElement = document.activeElement;
            
            // Tab navigation with arrow keys
            if (activeElement.classList.contains('tab-btn')) {
                this.handleTabNavigation(e, activeElement);
            }
            
            // Menu navigation
            if (activeElement.closest('.menu')) {
                this.handleMenuNavigation(e, activeElement);
            }
        });

        // Escape key handling
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.handleEscape();
            }
        });
    }

    /**
     * Handle tab navigation with arrow keys
     */
    handleTabNavigation(event, activeTab) {
        const tabs = Array.from(document.querySelectorAll('.tab-btn'));
        const currentIndex = tabs.indexOf(activeTab);
        
        let newIndex;
        if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
            event.preventDefault();
            newIndex = currentIndex > 0 ? currentIndex - 1 : tabs.length - 1;
        } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
            event.preventDefault();
            newIndex = currentIndex < tabs.length - 1 ? currentIndex + 1 : 0;
        } else if (event.key === 'Home') {
            event.preventDefault();
            newIndex = 0;
        } else if (event.key === 'End') {
            event.preventDefault();
            newIndex = tabs.length - 1;
        }
        
        if (newIndex !== undefined) {
            tabs[newIndex].focus();
            tabs[newIndex].click();
        }
    }

    /**
     * Handle menu navigation with arrow keys
     */
    handleMenuNavigation(event, activeElement) {
        const menuItems = Array.from(activeElement.closest('.menu').querySelectorAll('a, button'));
        const currentIndex = menuItems.indexOf(activeElement);
        
        let newIndex;
        if (event.key === 'ArrowUp') {
            event.preventDefault();
            newIndex = currentIndex > 0 ? currentIndex - 1 : menuItems.length - 1;
        } else if (event.key === 'ArrowDown') {
            event.preventDefault();
            newIndex = currentIndex < menuItems.length - 1 ? currentIndex + 1 : 0;
        }
        
        if (newIndex !== undefined) {
            menuItems[newIndex].focus();
        }
    }

    /**
     * Handle escape key for closing modals/menus
     */
    handleEscape() {
        // Close active modals
        const activeModal = document.querySelector('[role="dialog"]:not([hidden]), .modal.active');
        if (activeModal) {
            const closeButton = activeModal.querySelector('[data-close], .close, .btn-close');
            if (closeButton) {
                closeButton.click();
            }
            return;
        }

        // Close dropdown menus
        const openDropdown = document.querySelector('.dropdown.open, .menu-open');
        if (openDropdown) {
            openDropdown.classList.remove('open', 'menu-open');
            return;
        }

        // Return focus to last focused element if needed
        if (this.focusHistory.length > 1) {
            const previousElement = this.focusHistory[this.focusHistory.length - 2];
            if (previousElement && document.contains(previousElement)) {
                previousElement.focus();
            }
        }
    }

    /**
     * Setup form accessibility enhancements
     */
    setupFormAccessibility() {
        // Enhanced form validation feedback
        document.addEventListener('input', (e) => {
            if (e.target.matches('input, select, textarea')) {
                this.handleFormFieldValidation(e.target);
            }
        });

        // Form submission accessibility
        document.addEventListener('submit', (e) => {
            this.handleFormSubmission(e);
        });

        // Add required field indicators
        this.markRequiredFields();
    }

    /**
     * Handle form field validation with accessibility
     */
    handleFormFieldValidation(field) {
        const formGroup = field.closest('.form-group');
        if (!formGroup) return;

        // Remove existing validation states
        formGroup.classList.remove('error', 'success');
        
        // Remove existing error/success messages
        const existingFeedback = formGroup.querySelector('.error-text, .success-text');
        if (existingFeedback) {
            existingFeedback.remove();
        }

        // Check field validity
        let isValid = field.checkValidity();
        let message = '';

        // Custom validation for specific fields
        if (field.type === 'email' && field.value && !isValid) {
            message = 'Please enter a valid email address';
        } else if (field.type === 'password' && field.value && field.value.length < 8) {
            message = 'Password must be at least 8 characters long';
            isValid = false;
        } else if (field.required && !field.value.trim()) {
            message = 'This field is required';
            isValid = false;
        }

        // Apply validation state
        if (field.value) {
            if (isValid) {
                formGroup.classList.add('success');
                message = 'Valid input';
                this.addFieldFeedback(formGroup, message, 'success');
            } else {
                formGroup.classList.add('error');
                this.addFieldFeedback(formGroup, message, 'error');
            }
        }

        // Update ARIA attributes
        field.setAttribute('aria-invalid', !isValid);
        if (message) {
            const feedbackId = `${field.id || field.name}-feedback`;
            field.setAttribute('aria-describedby', feedbackId);
        }
    }

    /**
     * Add accessible field feedback
     */
    addFieldFeedback(formGroup, message, type) {
        const feedback = document.createElement('div');
        feedback.className = `${type}-text`;
        feedback.textContent = message;
        
        const field = formGroup.querySelector('input, select, textarea');
        const feedbackId = `${field.id || field.name}-feedback`;
        feedback.id = feedbackId;
        
        formGroup.appendChild(feedback);
        
        // Announce error messages immediately
        if (type === 'error') {
            this.announce(message, true);
        }
    }

    /**
     * Mark required fields for accessibility
     */
    markRequiredFields() {
        const requiredFields = document.querySelectorAll('input[required], select[required], textarea[required]');
        requiredFields.forEach(field => {
            const label = document.querySelector(`label[for="${field.id}"]`) || 
                         field.closest('.form-group')?.querySelector('label');
            
            if (label && !label.classList.contains('required')) {
                label.classList.add('required');
                
                // Add aria-required
                field.setAttribute('aria-required', 'true');
                
                // Update label text for screen readers
                const labelText = label.textContent || label.innerText;
                if (!labelText.includes('required')) {
                    const srText = document.createElement('span');
                    srText.className = 'sr-only';
                    srText.textContent = ' (required)';
                    label.appendChild(srText);
                }
            }
        });
    }

    /**
     * Handle form submission accessibility
     */
    handleFormSubmission(event) {
        const form = event.target;
        const submitButton = form.querySelector('button[type="submit"], input[type="submit"]');
        
        if (submitButton) {
            // Add loading state
            submitButton.setAttribute('aria-busy', 'true');
            submitButton.disabled = true;
            
            const originalText = submitButton.textContent;
            submitButton.textContent = submitButton.dataset.loadingText || 'Processing...';
            
            // Announce form submission
            this.announce('Form submitted, processing...', true);
            
            // Reset button state after a delay (will be overridden by actual response)
            setTimeout(() => {
                submitButton.setAttribute('aria-busy', 'false');
                submitButton.disabled = false;
                submitButton.textContent = originalText;
            }, 10000);
        }
    }

    /**
     * Setup progress announcements
     */
    setupProgressAnnouncements() {
        // Observe progress elements and announce updates
        const progressElements = document.querySelectorAll('.progress-bar, [role="progressbar"]');
        
        progressElements.forEach(progress => {
            this.setupProgressObserver(progress);
        });
    }

    /**
     * Setup progress bar observer
     */
    setupProgressObserver(progressElement) {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach(mutation => {
                if (mutation.type === 'attributes' && 
                    (mutation.attributeName === 'aria-valuenow' || 
                     mutation.attributeName === 'data-progress')) {
                    
                    const value = progressElement.getAttribute('aria-valuenow') || 
                                progressElement.getAttribute('data-progress');
                    
                    if (value) {
                        this.announce(`Progress: ${value}%`);
                    }
                }
            });
        });
        
        observer.observe(progressElement, {
            attributes: true,
            attributeFilter: ['aria-valuenow', 'data-progress']
        });
    }

    /**
     * Setup modal accessibility
     */
    setupModalAccessibility() {
        // Observe for new modals
        const observer = new MutationObserver((mutations) => {
            mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === 1) { // Element node
                        if (node.matches('[role="dialog"], .modal') || 
                            node.querySelector('[role="dialog"], .modal')) {
                            this.setupModalElement(node.matches('[role="dialog"], .modal') ? node : 
                                                 node.querySelector('[role="dialog"], .modal'));
                        }
                    }
                });
            });
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
        
        // Setup existing modals
        document.querySelectorAll('[role="dialog"], .modal').forEach(modal => {
            this.setupModalElement(modal);
        });
    }

    /**
     * Setup individual modal element
     */
    setupModalElement(modal) {
        // Ensure proper ARIA attributes
        if (!modal.getAttribute('role')) {
            modal.setAttribute('role', 'dialog');
        }
        
        if (!modal.getAttribute('aria-modal')) {
            modal.setAttribute('aria-modal', 'true');
        }
        
        // Find and set aria-labelledby if there's a title
        const title = modal.querySelector('h1, h2, h3, h4, h5, h6, .modal-title');
        if (title && !title.id) {
            title.id = `modal-title-${Date.now()}`;
        }
        if (title && !modal.getAttribute('aria-labelledby')) {
            modal.setAttribute('aria-labelledby', title.id);
        }
        
        // Set up focus management for when modal opens
        const modalObserver = new MutationObserver((mutations) => {
            mutations.forEach(mutation => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    if (modal.classList.contains('active') || !modal.hidden) {
                        this.focusModal(modal);
                    }
                }
            });
        });
        
        modalObserver.observe(modal, {
            attributes: true,
            attributeFilter: ['class', 'hidden']
        });
    }

    /**
     * Focus management for modal
     */
    focusModal(modal) {
        // Store the previously focused element
        this.previouslyFocused = document.activeElement;
        
        // Focus the modal or first focusable element in it
        const firstFocusable = modal.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (firstFocusable) {
            firstFocusable.focus();
        } else {
            modal.focus();
        }
        
        // Announce modal opening
        const title = modal.querySelector('h1, h2, h3, h4, h5, h6, .modal-title');
        if (title) {
            this.announce(`Dialog opened: ${title.textContent}`, true);
        }
    }

    /**
     * Utility function to update button loading state
     */
    setButtonLoading(button, loading, loadingText = 'Loading...') {
        if (loading) {
            button.setAttribute('aria-busy', 'true');
            button.disabled = true;
            button.dataset.originalText = button.textContent;
            button.textContent = loadingText;
        } else {
            button.setAttribute('aria-busy', 'false');
            button.disabled = false;
            button.textContent = button.dataset.originalText || button.textContent;
        }
    }

    /**
     * Utility function to announce status updates
     */
    announceStatusUpdate(message, type = 'info') {
        const urgentTypes = ['error', 'warning', 'success'];
        const isUrgent = urgentTypes.includes(type);
        this.announce(message, isUrgent);
    }

    /**
     * Setup table accessibility
     */
    setupTableAccessibility() {
        const tables = document.querySelectorAll('table');
        tables.forEach(table => {
            // Add table role if missing
            if (!table.getAttribute('role')) {
                table.setAttribute('role', 'table');
            }
            
            // Ensure headers have scope attributes
            const headers = table.querySelectorAll('th');
            headers.forEach(header => {
                if (!header.getAttribute('scope')) {
                    // Determine if it's a column or row header
                    const isInThead = header.closest('thead');
                    header.setAttribute('scope', isInThead ? 'col' : 'row');
                }
            });
            
            // Add table caption if missing
            if (!table.querySelector('caption')) {
                const caption = document.createElement('caption');
                caption.textContent = table.getAttribute('aria-label') || 'Data table';
                caption.className = 'sr-only';
                table.insertBefore(caption, table.firstChild);
            }
        });
    }
}

// Initialize accessibility manager when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.accessibilityManager = new AccessibilityManager();
    });
} else {
    window.accessibilityManager = new AccessibilityManager();
}

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.AccessibilityManager = AccessibilityManager;
}