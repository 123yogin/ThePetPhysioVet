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
  /** Hand-written page <h1>. Falls back to the entity title. */
  seoH1?: string;
  /** Hand-written <title> (<= 60 chars as displayed). Preferred over the template. */
  seoTitle?: string;
  /** Hand-written meta description (140-160 chars). Preferred over the template. */
  seoDescription?: string;
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
  /** Hand-written page <h1>. Falls back to the entity title. */
  seoH1?: string;
  /** Hand-written <title> (<= 60 chars as displayed). Preferred over the template. */
  seoTitle?: string;
  /** Hand-written meta description (140-160 chars). Preferred over the template. */
  seoDescription?: string;
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
  /** Verbatim quote — trimmed of a leading "& " / "..." at most, never paraphrased. */
  quote: string;
  /** Who said it. An initial ("R.") when that's all the source gives, or
   *  "Google review" when no name at all is available. Never a fabricated
   *  full name. */
  ownerName: string;
  /** Out of 5 (bestRating). Genuine reviews only — never invented. */
  rating: number;
  /** Where the review came from, e.g. "Google". Feeds the Review schema node. */
  source: string;
  // Everything below is optional and filled ONLY when the reviewer actually
  // stated it. Most real reviews (e.g. Google Business Profile excerpts) name
  // neither a pet nor a condition nor an outcome duration — leave the field
  // out rather than fabricating a plausible-looking value.
  petName?: string;
  breed?: string;
  condition?: string;
  storyDetails?: string;
  duration?: string;
  imageUrl?: string;
  altText?: string;
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
  /** Optional <title> / <h1> overrides for the profile page. */
  seoTitle?: string;
  seoH1?: string;
  bio: string;
  specialties: string[];
  experienceYears: number;
  imageUrl: string;
  altText: string;
  /** Formal standalone portrait for the dedicated profile page. The homepage
   *  "about" card keeps the warmer `imageUrl` (clinician with a patient);
   *  falls back to `imageUrl` when unset. */
  portraitUrl?: string;
  portraitAlt?: string;
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
   * frame, so the tile renders the <video> itself (LazyLoopVideo), attaching
   * the small loop only as the tile nears the viewport. The whole reel is
   * loaded when a visitor opens it.
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
