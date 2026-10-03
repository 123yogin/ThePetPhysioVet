import React from 'react';
import { GalleryItem } from '../types';
import { X } from 'lucide-react';

interface LightboxModalProps {
  item: GalleryItem | null;
  onClose: () => void;
}

/**
 * Gallery lightbox built on the native <dialog> element, so focus-trap, Escape,
 * aria-modal and an inert background come from the platform instead of
 * hand-rolled code. The dialog fills the viewport as the dim overlay and the
 * content box sits inside. `data-lenis-prevent` stops the site's Lenis
 * smooth-scroll (which runs on the document) from hijacking wheel/touch while
 * the modal is open.
 */
export const LightboxModal: React.FC<LightboxModalProps> = ({ item, onClose }) => {
  const dialogRef = React.useRef<HTMLDialogElement>(null);

  // Drive the element's open state from the `item` prop. showModal() (not open=true)
  // is what puts the dialog in the top layer and gives the focus trap + ::backdrop.
  React.useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (item && !dlg.open) dlg.showModal();
    else if (!item && dlg.open) dlg.close();
  }, [item]);

  if (!item) return null;

  return (
    <dialog
      ref={dialogRef}
      data-lenis-prevent
      onCancel={onClose}
      onClose={onClose}
      // A click that lands on the dialog itself (the overlay area outside the
      // content box) closes it; clicks inside the box don't bubble to here.
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose();
      }}
      aria-label={`${item.title} — gallery item`}
      className="m-0 max-w-none max-h-none w-screen h-screen border-0 bg-black/80 backdrop-blur-sm p-4 flex items-center justify-center backdrop:bg-black/40"
    >
      <div className="max-w-4xl w-full max-h-[90vh] overflow-auto bg-(--c-bg) border border-(--c-line) p-4 sm:p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-2 bg-(--c-ink) text-white hover:bg-(--c-body) transition-colors cursor-pointer"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {/* A reel is vertical 9:16; a photo is 16:10. Video gets its own height
            cap + object-contain so it isn't letterboxed into a stripe. */}
        {item.videoUrl ? (
          <div className="w-full overflow-hidden bg-black mb-4 flex items-center justify-center">
            <video
              src={item.videoUrl}
              controls
              autoPlay
              playsInline
              preload="metadata"
              aria-label={item.altText}
              className="max-h-[70vh] w-auto max-w-full"
            />
          </div>
        ) : (
          <div className="aspect-[16/10] w-full overflow-hidden bg-(--c-surface-3) mb-4">
            <img src={item.imageUrl} alt={item.altText} className="w-full h-full object-cover" />
          </div>
        )}

        <div className="flex justify-between items-center font-(family-name:--f-body) px-2">
          <div>
            <span className="text-[10px] uppercase tracking-widest text-(--c-accent) font-semibold block">
              {item.category}
            </span>
            <h3 className="font-(family-name:--f-display) text-lg text-(--c-ink) font-medium">
              {item.title}
            </h3>
          </div>

          <button
            onClick={onClose}
            className="text-xs text-(--c-body) uppercase tracking-widest hover:text-(--c-ink)"
          >
            Close View
          </button>
        </div>
      </div>
    </dialog>
  );
};
