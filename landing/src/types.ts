export interface ConditionItem {
  id: string;
  title: string;
  category: 'degenerative' | 'post-op' | 'neurological' | 'lifestyle';
  shortDesc: string;
  fullDesc: string;
  symptoms: string[];
  recommendedTherapies: string[];
  expectedRecoveryTime: string;
  imageUrl: string;
  altText: string;
}

export interface ServiceItem {
  id: string;
  title: string;
  icon: string;
  shortDesc: string;
  fullDesc: string;
  benefits: string[];
  suitableFor: string[];
  duration: string;
}

export interface JourneyStep {
  number: string;
  title: string;
  desc: string;
  details: string;
  whatToExpect: string[];
}

export interface SuccessStory {
  id: string;
  petName: string;
  breed: string;
  condition: string;
  quote: string;
  ownerName: string;
  storyDetails: string;
  duration: string;
  imageUrl: string;
  altText: string;
}

export interface Specialist {
  id: string;
  name: string;
  role: string;
  credentials: string;
  /** Post-nominals for the card and modal. The full `credentials` list is
   *  long enough to crowd a summary card, so the short form leads and the
   *  profile page carries every qualification. Falls back to `credentials`
   *  when unset. */
  credentialsShort?: string;
  bio: string;
  specialties: string[];
  experienceYears: number;
  imageUrl: string;
  altText: string;
}

export interface GalleryItem {
  id: string;
  title: string;
  category: string;
  /** Photograph. Empty for a reel, which shows its own first frame instead. */
  imageUrl: string;
  altText: string;
  /**
   * Present when the item is one of the clinic's reels.
   *
   * Reels deliberately carry NO poster image. Extracting a still and
   * re-compressing it produced a worse picture than the video's own first
   * frame, so the tile renders the <video> itself with preload="metadata" --
   * the browser paints frame one at native quality and fetches only the header,
   * not the file. The whole reel is loaded when a visitor opens it.
   */
  videoUrl?: string;
  /**
   * Small silent loop shown in the grid, playing continuously.
   *
   * A separate rendition from `videoUrl` on purpose: autoplaying the four full
   * reels would have meant ~15MB and four audio tracks decoding on page load.
   * These are 12 seconds, 360px wide and stripped of audio -- about 1.9MB for
   * all four, roughly what four photographs would have cost -- while the full
   * reel with its sound is fetched only when someone opens it.
   */
  previewUrl?: string;
}

export interface FAQItem {
  id: string;
  question: string;
  answer: string;
  category: string;
}

export interface AppointmentData {
  firstName: string;
  lastName: string;
  petName: string;
  speciesBreed: string;
  email: string;
  phone: string;
  preferredDate?: string;
  preferredSpecialist?: string;
  /** An Appointment.VISIT_TYPES *code*, fetched from the clinic API rather
   *  than hardcoded here -- the site must not be able to offer a service the
   *  booking form would then reject. */
  service?: string;
  reason: string;
  conditionId?: string;
}
