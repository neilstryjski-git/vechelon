import React, { useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useToast } from '../store/useToast';

interface EndRideButtonProps {
  rideId: string;
}

/**
 * Tactical "End Ride" action component.
 * Triggers status update, coordinate capture, and AI summary generation.
 * Fulfills W26: Post-ride WhatsApp Summary & Clipboard Bridge.
 */
const EndRideButton: React.FC<EndRideButtonProps> = ({ rideId }) => {
  const [isEnding, setIsEnding] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const endRide = useAppStore((state) => state.endRide);
  const { addToast } = useToast();

  const handleEndRide = async () => {
    if (!window.confirm('Are you sure you want to end this tactical session?')) return;
    
    setIsEnding(true);
    try {
      const data = await endRide(rideId);
      setSummary(data.summary);
      addToast('Ride finalized and summary generated.', 'success');
    } catch (error) {
      console.error('Failed to end ride', error);
      addToast('Error finalizing ride metadata.', 'error');
    } finally {
      setIsEnding(false);
    }
  };

  const copyToClipboard = () => {
    if (summary) {
      navigator.clipboard.writeText(summary);
      addToast('Summary copied to clipboard.', 'success');
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {!summary ? (
        <button
          onClick={handleEndRide}
          disabled={isEnding}
          className={`px-6 py-3 rounded font-label text-[10px] tracking-widest uppercase transition-all ${
            isEnding 
              ? 'bg-surface-container-highest text-on-surface opacity-50 cursor-not-allowed' 
              : 'bg-error text-on-error hover:bg-error/90 active:scale-95'
          }`}
        >
          {isEnding ? 'Finalizing Tactical Data...' : 'End Tactical Session'}
        </button>
      ) : (
        <div className="bg-surface-container-high p-6 rounded-lg border border-brand-primary/20 animate-in fade-in zoom-in duration-500">
          <span className="font-label text-[10px] text-brand-primary uppercase tracking-widest block mb-2">
            AI Generated Summary
          </span>
          <p className="font-body text-sm text-on-surface whitespace-pre-wrap mb-6 italic leading-relaxed">
            "{summary}"
          </p>
          <button
            onClick={copyToClipboard}
            className="w-full bg-brand-primary text-on-primary py-3 rounded font-label text-[10px] tracking-widest uppercase hover:bg-brand-primary/90 transition-all"
          >
            Copy to WhatsApp
          </button>
        </div>
      )}
    </div>
  );
};

export default EndRideButton;
