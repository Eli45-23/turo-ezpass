/**
 * Glassmorphism Modal System
 * Provides consistent modal styling across the application
 */

class GlassmorphismModal {
    constructor() {
        this.modals = new Map();
        this.zIndex = 10000;
        this.init();
    }

    init() {
        this.injectStyles();
        this.setupEventListeners();
    }

    injectStyles() {
        if (document.getElementById('glassmorphism-modal-styles')) return;

        const styles = `
        <style id="glassmorphism-modal-styles">
        .glass-modal-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.5);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            z-index: var(--z-modal-backdrop, 10000);
            display: none;
            align-items: center;
            justify-content: center;
            animation: glassModalFadeIn 0.3s ease-out;
        }
        
        .glass-modal-overlay.show {
            display: flex;
        }
        
        .glass-modal-content {
            background: rgba(255, 255, 255, 0.08) !important;
            backdrop-filter: blur(10px) !important;
            -webkit-backdrop-filter: blur(10px) !important;
            border: 1px solid rgba(255, 255, 255, 0.1) !important;
            border-radius: 16px !important;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.4), 0 10px 10px -5px rgba(0, 0, 0, 0.3) !important;
            max-width: 500px;
            width: 90vw;
            max-height: 90vh;
            overflow: hidden;
            animation: glassModalSlideIn 0.3s ease-out;
        }
        
        .glass-modal-header {
            padding: 24px !important;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1) !important;
            background: rgba(0, 0, 0, 0.2) !important;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .glass-modal-title {
            font-size: 1.25rem !important;
            font-weight: 600 !important;
            color: white !important;
            margin: 0;
            font-family: 'JetBrains Mono', monospace !important;
        }
        
        .glass-modal-close {
            background: none !important;
            border: none !important;
            color: rgba(255, 255, 255, 0.7) !important;
            font-size: 1.5rem !important;
            cursor: pointer;
            padding: 0.5rem !important;
            border-radius: 8px !important;
            transition: all 0.3s ease !important;
            width: 40px;
            height: 40px;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        
        .glass-modal-close:hover {
            background: rgba(255, 255, 255, 0.1) !important;
            color: white !important;
        }
        
        .glass-modal-body {
            padding: 24px !important;
            overflow-y: auto;
            max-height: 60vh;
            background: transparent !important;
            color: rgba(255, 255, 255, 0.9) !important;
            line-height: 1.6;
        }
        
        .glass-modal-footer {
            padding: 24px !important;
            border-top: 1px solid rgba(255, 255, 255, 0.1) !important;
            background: rgba(0, 0, 0, 0.2) !important;
            display: flex;
            justify-content: flex-end;
            gap: 12px !important;
        }
        
        .glass-btn {
            padding: 0.75rem 1.5rem !important;
            border-radius: 8px !important;
            font-weight: 500 !important;
            font-size: 0.875rem !important;
            cursor: pointer;
            transition: all 0.3s ease !important;
            border: 1px solid transparent !important;
            font-family: 'JetBrains Mono', monospace !important;
        }
        
        .glass-btn-primary {
            background: rgba(34, 211, 238, 0.2) !important;
            color: #22d3ee !important;
            border-color: rgba(34, 211, 238, 0.3) !important;
        }
        
        .glass-btn-primary:hover {
            background: rgba(34, 211, 238, 0.3) !important;
            transform: translateY(-1px);
        }
        
        .glass-btn-secondary {
            background: rgba(255, 255, 255, 0.1) !important;
            color: rgba(255, 255, 255, 0.8) !important;
            border-color: rgba(255, 255, 255, 0.2) !important;
        }
        
        .glass-btn-secondary:hover {
            background: rgba(255, 255, 255, 0.15) !important;
            color: white !important;
            transform: translateY(-1px);
        }
        
        .glass-btn-danger {
            background: rgba(239, 68, 68, 0.2) !important;
            color: #ef4444 !important;
            border-color: rgba(239, 68, 68, 0.3) !important;
        }
        
        .glass-btn-danger:hover {
            background: rgba(239, 68, 68, 0.3) !important;
            transform: translateY(-1px);
        }
        
        @keyframes glassModalFadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }
        
        @keyframes glassModalSlideIn {
            from { 
                opacity: 0;
                transform: translateY(-20px) scale(0.95);
            }
            to { 
                opacity: 1;
                transform: translateY(0) scale(1);
            }
        }
        
        .glass-modal-icon {
            width: 48px;
            height: 48px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 16px;
            font-size: 24px;
        }
        
        .glass-modal-icon.success {
            background: rgba(34, 197, 94, 0.2);
            color: #22c55e;
        }
        
        .glass-modal-icon.error {
            background: rgba(239, 68, 68, 0.2);
            color: #ef4444;
        }
        
        .glass-modal-icon.warning {
            background: rgba(245, 158, 11, 0.2);
            color: #f59e0b;
        }
        
        .glass-modal-icon.info {
            background: rgba(34, 211, 238, 0.2);
            color: #22d3ee;
        }
        </style>`;

        document.head.insertAdjacentHTML('beforeend', styles);
    }

    setupEventListeners() {
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeTopModal();
            }
        });
    }

    createModal(id, options = {}) {
        if (this.modals.has(id)) {
            return this.modals.get(id);
        }

        const modal = {
            id,
            element: null,
            options: {
                closable: true,
                ...options
            }
        };

        this.modals.set(id, modal);
        return modal;
    }

    showAlert(title, message, type = 'info') {
        return new Promise((resolve) => {
            const modalId = `alert-${Date.now()}`;
            const modal = this.createModal(modalId);

            const iconMap = {
                success: '✅',
                error: '❌', 
                warning: '⚠️',
                info: 'ℹ️'
            };

            const overlay = document.createElement('div');
            overlay.className = 'glass-modal-overlay show';
            overlay.innerHTML = `
                <div class="glass-modal-content">
                    <div class="glass-modal-header">
                        <h3 class="glass-modal-title">${title}</h3>
                        <button class="glass-modal-close" data-action="close">×</button>
                    </div>
                    <div class="glass-modal-body">
                        <div class="glass-modal-icon ${type}">
                            ${iconMap[type] || iconMap.info}
                        </div>
                        <p style="text-align: center; margin: 0;">${message}</p>
                    </div>
                    <div class="glass-modal-footer">
                        <button class="glass-btn glass-btn-primary" data-action="ok">OK</button>
                    </div>
                </div>
            `;

            modal.element = overlay;
            document.body.appendChild(overlay);

            // Event listeners
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay || e.target.dataset.action === 'close' || e.target.dataset.action === 'ok') {
                    this.closeModal(modalId);
                    resolve(true);
                }
            });

            // Auto-focus the OK button
            setTimeout(() => {
                const okButton = overlay.querySelector('[data-action="ok"]');
                if (okButton) okButton.focus();
            }, 100);
        });
    }

    showConfirm(title, message, options = {}) {
        return new Promise((resolve) => {
            const modalId = `confirm-${Date.now()}`;
            const modal = this.createModal(modalId);

            const {
                confirmText = 'Confirm',
                cancelText = 'Cancel',
                confirmStyle = 'primary',
                dangerous = false
            } = options;

            const confirmClass = dangerous ? 'glass-btn-danger' : `glass-btn-${confirmStyle}`;

            const overlay = document.createElement('div');
            overlay.className = 'glass-modal-overlay show';
            overlay.innerHTML = `
                <div class="glass-modal-content">
                    <div class="glass-modal-header">
                        <h3 class="glass-modal-title">${title}</h3>
                        <button class="glass-modal-close" data-action="close">×</button>
                    </div>
                    <div class="glass-modal-body">
                        <div class="glass-modal-icon ${dangerous ? 'warning' : 'info'}">
                            ${dangerous ? '⚠️' : 'ℹ️'}
                        </div>
                        <p style="text-align: center; margin: 0; white-space: pre-line;">${message}</p>
                    </div>
                    <div class="glass-modal-footer">
                        <button class="glass-btn glass-btn-secondary" data-action="cancel">${cancelText}</button>
                        <button class="glass-btn ${confirmClass}" data-action="confirm">${confirmText}</button>
                    </div>
                </div>
            `;

            modal.element = overlay;
            document.body.appendChild(overlay);

            // Event listeners
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay || e.target.dataset.action === 'close' || e.target.dataset.action === 'cancel') {
                    this.closeModal(modalId);
                    resolve(false);
                } else if (e.target.dataset.action === 'confirm') {
                    this.closeModal(modalId);
                    resolve(true);
                }
            });

            // Auto-focus the cancel button (safer default)
            setTimeout(() => {
                const cancelButton = overlay.querySelector('[data-action="cancel"]');
                if (cancelButton) cancelButton.focus();
            }, 100);
        });
    }

    closeModal(modalId) {
        const modal = this.modals.get(modalId);
        if (modal && modal.element) {
            modal.element.remove();
            this.modals.delete(modalId);
        }
    }

    closeTopModal() {
        // Close the most recently opened modal
        const modalIds = Array.from(this.modals.keys());
        if (modalIds.length > 0) {
            const topModalId = modalIds[modalIds.length - 1];
            this.closeModal(topModalId);
        }
    }

    closeAllModals() {
        this.modals.forEach((modal, id) => {
            this.closeModal(id);
        });
    }
}

// Create global instance
window.glassModal = new GlassmorphismModal();

// Convenience functions for easy usage
window.showAlert = (title, message, type = 'info') => window.glassModal.showAlert(title, message, type);
window.showConfirm = (title, message, options = {}) => window.glassModal.showConfirm(title, message, options);