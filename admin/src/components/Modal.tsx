import React from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  type?: 'danger' | 'info';
}

const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  type = 'info'
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-background/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />
      
      {/* Modal Container */}
      <div className="relative bg-surface-container-lowest border border-outline-variant/30 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in duration-200">
        
        {/* Header Decor */}
        <div className={`h-1 w-full ${type === 'danger' ? 'bg-error' : 'signature-gradient'}`} />

        <div className="p-8">
          <h3 className="font-headline font-bold text-2xl text-on-background mb-4">
            {title}
          </h3>
          <p className="font-body text-on-surface-variant leading-relaxed mb-8">
            {message}
          </p>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={onConfirm}
              className={`flex-1 py-3 rounded-md font-label text-xs font-bold uppercase tracking-widest transition-all active:scale-95 ${
                type === 'danger' 
                  ? 'bg-error text-on-error hover:bg-error/90' 
                  : 'signature-gradient text-on-primary hover:opacity-90'
              }`}
            >
              {confirmLabel}
            </button>
            <button
              onClick={onClose}
              className="flex-1 py-3 rounded-md font-label text-xs font-bold uppercase tracking-widest bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest transition-all active:scale-95"
            >
              {cancelLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Modal;
