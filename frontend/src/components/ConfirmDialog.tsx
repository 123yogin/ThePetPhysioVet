import React, { useEffect, useId, useRef, useState } from 'react';

/**
 * A small confirm step for actions that cannot be undone from the screen
 * (cancel a visit, cancel a stay, void an invoice, finish a rehab plan).
 * Live QA 2026-10-08 found several of these firing on a single tap.
 *
 * Modal and keyboard-safe: role="dialog" + aria-modal, labelled by its title,
 * Escape or the backdrop dismisses, focus starts on the safe button.
 * Pass `reasonLabel` to collect an optional free-text reason.
 */
export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body?: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** Destructive actions get the red confirm button. */
  danger?: boolean;
  busy?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open, title, body, confirmLabel, cancelLabel = 'Keep it', danger, busy,
  reasonLabel, reasonPlaceholder, onConfirm, onClose,
}) => {
  const titleId = useId();
  const reasonId = useId();
  const [reason, setReason] = useState('');
  const safeRef = useRef<HTMLButtonElement>(null);

  // Reset and focus only when the dialog opens -- not on every parent render,
  // which would wipe a half-typed reason.
  useEffect(() => {
    if (!open) return;
    setReason('');
    safeRef.current?.focus();
  }, [open]);

  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) closeRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, busy]);

  if (!open) return null;

  return (
    <div
      className="confirm-backdrop"
      onClick={() => { if (!busy) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000, display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: '16px',
        background: 'rgba(62, 39, 35, 0.45)',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="glass-card"
        onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: '420px', background: 'var(--white, #fff)', margin: 0 }}
      >
        <h3 id={titleId} style={{ margin: '0 0 8px', fontSize: '18px', color: 'var(--brown-900)' }}>{title}</h3>
        {body && <div style={{ fontSize: '14px', color: 'var(--brown-700)', lineHeight: 1.5 }}>{body}</div>}
        {reasonLabel && (
          <div style={{ marginTop: '12px' }}>
            <label htmlFor={reasonId} style={{ fontSize: '12px', fontWeight: 700, color: 'var(--brown-700)', display: 'block', marginBottom: '4px' }}>
              {reasonLabel}
            </label>
            <textarea
              id={reasonId}
              className="input-glass"
              rows={2}
              maxLength={255}
              value={reason}
              placeholder={reasonPlaceholder}
              onChange={(e) => setReason(e.target.value)}
              style={{ width: '100%', resize: 'vertical' }}
            />
          </div>
        )}
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px', flexWrap: 'wrap' }}>
          <button ref={safeRef} type="button" className="btn btn-ghost btn-sm" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => onConfirm(reason.trim())}
            disabled={busy}
            style={danger ? { background: '#b71c1c', borderColor: '#b71c1c', color: '#fff' } : undefined}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
