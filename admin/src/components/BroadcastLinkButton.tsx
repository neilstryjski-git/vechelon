import React, { useState } from 'react';
import { useToast } from '../store/useToast';

interface BroadcastLinkButtonProps {
  /** The link to copy. Required — an empty url disables the button. */
  url: string;
  /**
   * Full text to place on the clipboard. Defaults to the url alone. Pass a
   * ready-to-send SMS/WhatsApp message (with the link embedded) so an admin can
   * paste straight into a conversation.
   */
  message?: string;
  /** Button label. Defaults to "Copy link". */
  label?: string;
  /** Toast shown on success. Defaults to "Link copied — paste into SMS or WhatsApp." */
  successToast?: string;
  className?: string;
}

/**
 * BroadcastLinkButton (W254, Goal G31)
 *
 * A self-contained clipboard bridge: copies a completion link (or a ready-to-send
 * message wrapping it) so an admin can hand-deliver it via SMS or WhatsApp — there
 * is no SMS provider. Mirrors the EndRideButton "Copy to WhatsApp" pattern.
 *
 * Pure presentational: it receives a link and copies it. It never calls an edge
 * function — minting the link is the caller's job (W255).
 */
const BroadcastLinkButton: React.FC<BroadcastLinkButtonProps> = ({
  url,
  message,
  label = 'Copy link',
  successToast = 'Link copied — paste into SMS or WhatsApp.',
  className = '',
}) => {
  const { addToast } = useToast();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!url) return;
    const text = message ?? url;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback for insecure contexts / older browsers.
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      addToast(successToast, 'success');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      addToast('Could not copy automatically — copy the link manually.', 'error');
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      disabled={!url}
      className={`inline-flex items-center gap-2 px-4 py-2 rounded font-label text-[10px] tracking-widest uppercase transition-all bg-brand-primary text-on-primary hover:bg-brand-primary/90 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed ${className}`}
    >
      <span className="material-symbols-outlined text-sm">
        {copied ? 'check' : 'content_copy'}
      </span>
      {copied ? 'Copied' : label}
    </button>
  );
};

export default BroadcastLinkButton;
