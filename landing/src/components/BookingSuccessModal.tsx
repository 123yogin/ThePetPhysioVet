import React from 'react';
import { AppointmentData } from '../types';
import { Check, Copy, X } from 'lucide-react';

interface BookingSuccessModalProps {
  data: AppointmentData | null;
  refId: string | null;
  onClose: () => void;
}

/**
 * Booking confirmation, on the native <dialog> element (focus-trap, Escape,
 * aria-modal for free; `data-lenis-prevent` keeps Lenis off the modal). Mirrors
 * the LightboxModal pattern.
 */
export const BookingSuccessModal: React.FC<BookingSuccessModalProps> = ({ data, refId, onClose }) => {
  const dialogRef = React.useRef<HTMLDialogElement>(null);
  const [copied, setCopied] = React.useState(false);
  const open = !!(data && refId);

  React.useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (open && !dlg.open) dlg.showModal();
    else if (!open && dlg.open) dlg.close();
  }, [open]);

  if (!data || !refId) return null;

  const handleCopyRef = async () => {
    try {
      await navigator.clipboard.writeText(refId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable (insecure context / denied permission). The
      // reference is shown on screen for manual copy, so fail silently rather
      // than throw — no blocking alert().
    }
  };

  return (
    <dialog
      ref={dialogRef}
      data-lenis-prevent
      onCancel={onClose}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose();
      }}
      aria-labelledby="booking-success-title"
      className="m-0 max-w-none max-h-none w-screen h-screen border-0 bg-black/70 backdrop-blur-xs p-4 flex items-center justify-center backdrop:bg-black/40"
    >
      <div className="bg-(--c-bg) border border-(--c-line) max-w-lg w-full p-6 sm:p-8 shadow-2xl relative font-(family-name:--f-body) text-center">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-(--c-ink) hover:bg-(--c-surface-2) transition-colors cursor-pointer"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="w-16 h-16 bg-(--c-ink) text-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-md">
          <Check className="w-8 h-8" />
        </div>

        <span className="text-xs uppercase tracking-widest text-(--c-accent) font-semibold block mb-2">
          Request Received
        </span>

        <h2
          id="booking-success-title"
          className="font-(family-name:--f-display) text-2xl sm:text-3xl text-(--c-ink) font-medium mb-3"
        >
          Appointment Request Confirmed
        </h2>

        <p className="text-sm text-(--c-body) font-light leading-relaxed mb-6">
          Thank you, <strong className="text-(--c-ink)">{data.firstName}</strong>. Our clinical intake coordinator will review <strong className="text-(--c-ink)">{data.petName}</strong>'s medical details and call you back within 4 business hours to confirm your time slot.
        </p>

        <div className="bg-(--c-surface) p-5 border border-(--c-line)/50 text-left space-y-3 mb-6 text-xs text-(--c-body)">
          <div className="flex justify-between items-center border-b border-(--c-line)/30 pb-2">
            <span className="font-semibold text-(--c-ink)">Reference ID:</span>
            <button
              onClick={handleCopyRef}
              className="inline-flex items-center gap-1 text-(--c-accent) font-mono font-bold hover:underline cursor-pointer"
              aria-label={copied ? 'Reference copied' : 'Copy reference ID'}
            >
              <span>{refId}</span>
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>

          <div className="flex justify-between border-b border-(--c-line)/30 pb-2">
            <span>Patient:</span>
            <span className="font-medium text-(--c-ink)">{data.petName} ({data.speciesBreed || 'Pet'})</span>
          </div>

          <div className="flex justify-between border-b border-(--c-line)/30 pb-2">
            <span>Specialist:</span>
            <span className="font-medium text-(--c-ink)">{data.preferredSpecialist || 'First Available Specialist'}</span>
          </div>

          <div className="flex justify-between">
            <span>Contact Email:</span>
            <span className="font-medium text-(--c-ink)">{data.email}</span>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="w-full bg-(--c-ink) text-white py-3 text-xs uppercase tracking-widest font-medium hover:bg-(--c-body) transition-colors cursor-pointer"
          >
            Done &amp; Return To Main Site
          </button>
        </div>
      </div>
    </dialog>
  );
};
