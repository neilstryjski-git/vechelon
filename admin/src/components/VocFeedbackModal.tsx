import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

type FeedbackType = 'bug' | 'feature-request';
type FeedbackTheme = 'navigation' | 'performance' | 'ride-management' | 'membership-admin' | 'other';

const THEME_LABELS: Record<FeedbackTheme, string> = {
  navigation:        'Navigation',
  performance:       'Performance',
  'ride-management': 'Ride Management',
  'membership-admin':'Membership & Admin',
  other:             'Other',
};

const TITLE_MAX  = 200;
const DETAIL_MAX = 2000;

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const VocFeedbackModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const [feedbackType, setFeedbackType] = useState<FeedbackType>('bug');
  const [theme, setTheme] = useState<FeedbackTheme | ''>('');
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setFeedbackType('bug');
      setTheme('');
      setTitle('');
      setDetail('');
      setError(null);
      setSubmitted(false);
      setIsSubmitting(false);
    }
  }, [isOpen]);

  // Auto-close 3s after successful submission
  useEffect(() => {
    if (!submitted) return;
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [submitted, onClose]);

  const handleSubmit = async () => {
    if (!title.trim()) { setError('Title is required'); return; }
    setIsSubmitting(true);
    setError(null);
    try {
      const { error: efError } = await supabase.functions.invoke('voc-submit', {
        body: {
          type: feedbackType,
          theme: theme || null,
          title: title.trim(),
          detail: detail.trim() || undefined,
        },
      });
      if (efError) {
        let message = 'Something went wrong, please try again';
        try {
          const body = await (efError as { context?: Response }).context?.json?.();
          if (body?.error) message = body.error;
        } catch { /* ignore */ }
        throw new Error(message);
      }
      setSubmitted(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-background/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-surface-container-lowest border border-outline-variant/30 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
        {/* Top accent */}
        <div className="h-1 w-full signature-gradient" />

        {submitted ? (
          /* ── Success state ── */
          <div className="p-10 flex flex-col items-center text-center gap-4">
            <span className="material-symbols-outlined text-4xl text-tertiary">check_circle</span>
            <h3 className="font-headline font-bold text-xl text-on-background">Feedback submitted</h3>
            <p className="font-body text-sm text-on-surface-variant">
              Thanks — your feedback has been logged as a GitHub issue and will be reviewed by the team.
            </p>
            <p className="font-label text-[9px] uppercase tracking-widest text-on-surface-variant/50 mt-2">
              This window closes automatically
            </p>
          </div>
        ) : (
          /* ── Form state ── */
          <div className="p-8 space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-headline font-bold text-xl text-on-background flex items-center gap-2">
                  <span className="material-symbols-outlined text-xl text-on-surface-variant">feedback</span>
                  Submit Feedback
                </h3>
                <p className="font-label text-[9px] uppercase tracking-widest text-on-surface-variant mt-1">
                  Filed as a GitHub issue — visible to the team
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-1 rounded-full hover:bg-surface-container-high transition-colors text-on-surface-variant"
              >
                <span className="material-symbols-outlined text-base">close</span>
              </button>
            </div>

            {/* Type toggle */}
            <div>
              <p className="font-label text-[9px] uppercase tracking-widest text-on-surface-variant mb-2">Type</p>
              <div className="flex gap-2">
                {(['bug', 'feature-request'] as FeedbackType[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setFeedbackType(t)}
                    className={`flex-1 py-2.5 rounded-lg font-label text-[10px] uppercase tracking-widest border transition-all ${
                      feedbackType === t
                        ? 'bg-primary text-on-primary border-primary'
                        : 'bg-surface-container-low text-on-surface-variant border-outline-variant/30 hover:border-primary/40'
                    }`}
                  >
                    {t === 'bug' ? 'Bug Report' : 'Feature Request'}
                  </button>
                ))}
              </div>
            </div>

            {/* Theme (optional) */}
            <div>
              <p className="font-label text-[9px] uppercase tracking-widest text-on-surface-variant mb-2">
                Theme <span className="opacity-50 normal-case">— optional</span>
              </p>
              <select
                value={theme}
                onChange={(e) => setTheme(e.target.value as FeedbackTheme | '')}
                className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl px-4 py-3 font-body text-sm text-on-background focus:outline-none focus:border-brand-primary transition-all appearance-none"
              >
                <option value="">— No theme —</option>
                {(Object.keys(THEME_LABELS) as FeedbackTheme[]).map((k) => (
                  <option key={k} value={k}>{THEME_LABELS[k]}</option>
                ))}
              </select>
            </div>

            {/* Title */}
            <div>
              <div className="flex justify-between mb-2">
                <p className="font-label text-[9px] uppercase tracking-widest text-on-surface-variant">Title *</p>
                <p className={`font-label text-[9px] ${title.length > TITLE_MAX - 20 ? 'text-error' : 'text-on-surface-variant/50'}`}>
                  {title.length}/{TITLE_MAX}
                </p>
              </div>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value.slice(0, TITLE_MAX))}
                placeholder="One-line description of the issue or request"
                className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl px-4 py-3 font-body text-sm text-on-background placeholder:text-on-surface-variant/30 focus:outline-none focus:border-brand-primary transition-all"
              />
            </div>

            {/* Detail */}
            <div>
              <div className="flex justify-between mb-2">
                <p className="font-label text-[9px] uppercase tracking-widest text-on-surface-variant">
                  Detail <span className="opacity-50 normal-case">— optional</span>
                </p>
                <p className={`font-label text-[9px] ${detail.length > DETAIL_MAX - 200 ? 'text-error' : 'text-on-surface-variant/50'}`}>
                  {detail.length}/{DETAIL_MAX}
                </p>
              </div>
              <textarea
                value={detail}
                onChange={(e) => setDetail(e.target.value.slice(0, DETAIL_MAX))}
                rows={4}
                placeholder="Steps to reproduce, expected vs actual behaviour, or full feature description"
                className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl px-4 py-3 font-body text-sm text-on-background placeholder:text-on-surface-variant/30 focus:outline-none focus:border-brand-primary transition-all resize-none"
              />
            </div>

            {/* Error */}
            {error && (
              <p className="font-body text-sm text-error">{error}</p>
            )}

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || !title.trim()}
              className="w-full signature-gradient text-on-primary py-3.5 rounded-xl font-headline font-bold uppercase tracking-widest text-sm flex items-center justify-center gap-2 hover:opacity-90 transition-all active:scale-[0.98] disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-base">
                {isSubmitting ? 'hourglass_top' : 'send'}
              </span>
              {isSubmitting ? 'Submitting…' : 'Submit Feedback'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default VocFeedbackModal;
