/**
 * Shared Tailwind class strings for the booking subforms. These were identical
 * copies in FacilitySlotBooking, IndoorFacilityBooking and ServiceRequestBooking;
 * defined once here so every booking form keeps the same look.
 */
export const field =
  'w-full bg-transparent border-b border-(--c-line) focus:border-(--c-accent) outline-none py-2 text-(--c-ink) placeholder:text-(--c-mute-2)';
export const labelCls = 'block text-xs tracking-widest text-(--c-body) uppercase mb-2 font-medium';
export const primaryBtn =
  'w-full bg-(--c-ink) text-white py-3 text-xs uppercase tracking-widest font-semibold hover:bg-(--c-accent) transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2';
