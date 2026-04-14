import React from 'react';
import { useToast } from '../store/useToast';
import type { ToastType } from '../store/useToast';

const ToastIcon = ({ type }: { type: ToastType }) => {
  switch (type) {
    case 'success': return <span className="material-symbols-outlined text-tertiary">check_circle</span>;
    case 'error':   return <span className="material-symbols-outlined text-error">error</span>;
    default:        return <span className="material-symbols-outlined text-primary">info</span>;
  }
};

const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useToast();

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-3 pointer-events-none">
      {toasts.map((t) => (
        <div 
          key={t.id}
          className="glass shadow-ambient border border-outline-variant/20 rounded-xl p-4 min-w-[280px] max-w-sm flex items-center gap-4 animate-in slide-in-from-right-10 fade-in duration-500 pointer-events-auto cursor-pointer"
          onClick={() => removeToast(t.id)}
        >
          <ToastIcon type={t.type} />
          <div className="flex-1">
            <p className="font-body text-xs font-medium text-on-surface leading-tight">
              {t.message}
            </p>
          </div>
          <button className="material-symbols-outlined text-sm text-on-surface-variant/40 hover:text-on-surface transition-colors">
            close
          </button>
        </div>
      ))}
    </div>
  );
};

export default ToastContainer;
