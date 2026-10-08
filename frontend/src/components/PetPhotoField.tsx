import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react';
import { PET_PHOTO_ACCEPT, petPhotoError } from '../lib/uploads';
import { Icon } from './Icon';

interface PetPhotoFieldProps {
  file: File | null;
  onChange: (file: File | null) => void;
  /** Called with a readable message when a picked file is rejected client-side. */
  onError: (message: string) => void;
  disabled?: boolean;
  label?: string;
}

/**
 * Optional pet photo picker with a live preview. Type (JPEG/PNG/WebP/HEIC)
 * and the 4 MB cap are checked before anything is sent; the server re-checks
 * both and sniffs the bytes, so this is convenience, not the authority.
 */
export function PetPhotoField({ file, onChange, onError, disabled, label = 'Photo (optional)' }: PetPhotoFieldProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);

  useEffect(() => {
    setPreviewFailed(false);
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const pick = (e: ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0] ?? null;
    const err = petPhotoError(picked);
    if (err) {
      onError(err);
      e.target.value = '';
      onChange(null);
      return;
    }
    onChange(picked);
  };

  const clear = () => {
    onChange(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className="field">
      <label htmlFor={inputId}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 14,
            border: '1px dashed var(--glass-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            flexShrink: 0,
            color: 'var(--brown-500)',
          }}
        >
          {preview && !previewFailed ? (
            <img
              src={preview}
              alt="Selected pet photo preview"
              onError={() => setPreviewFailed(true)}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <Icon name="paw" size={24} />
          )}
        </div>
        <div style={{ minWidth: 0, flex: '1 1 180px' }}>
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept={PET_PHOTO_ACCEPT}
            className="input-glass"
            onChange={pick}
            disabled={disabled}
          />
          <p style={{ fontSize: '12px', color: 'var(--brown-600)', margin: '4px 0 0' }}>
            {file
              ? `${file.name}${previewFailed ? ' (preview not supported in this browser)' : ''}`
              : 'JPEG, PNG, WebP or HEIC, up to 4 MB.'}
          </p>
          {file && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={clear} disabled={disabled} style={{ marginTop: '4px' }}>
              Remove photo
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
