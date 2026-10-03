/**
 * Home route.
 *
 * Service, condition and specialist cards NAVIGATE to their detail routes.
 * They used to open modals that shadowed those pages, which meant 14 of the
 * site's 17 routes were reachable only by a crawler or a middle click. See
 * EntityCardLink for why that changed.
 *
 * The overlays that remain are the ones that are not documents: the gallery
 * lightbox (an image viewer) and the booking success modal (the end of a form).
 * The booking panels inside BookableServices are the same category -- a form,
 * not a page.
 */
import React, { useState } from 'react';
import { useRouter } from '../seo/router';
import { Navbar } from '../components/Navbar';
import { Hero } from '../components/Hero';
import { TrustMetrics } from '../components/TrustMetrics';
import { ConditionsSection } from '../components/ConditionsSection';
import { TreatmentJourney } from '../components/TreatmentJourney';
import { ServicesSection } from '../components/ServicesSection';
import { BookableServices } from '../components/BookableServices';
import { BookingPanel, bookingHref } from '../components/BookingPanel';
import { usePublicServiceCodes } from '../hooks/usePublicServiceCodes';
import { SuccessStories } from '../components/SuccessStories';
import { SpecialistsSection } from '../components/SpecialistsSection';
import { SplitDoorsReveal } from '../components/SplitDoorsReveal';
import { GallerySection } from '../components/GallerySection';
import { FaqSection } from '../components/FaqSection';
import { Footer } from '../components/Footer';

// An image viewer -- the one overlay this page still owns. The booking form
// and its confirmation belong to BookingPanel, which every layout mounts.
import { LightboxModal } from '../components/LightboxModal';

import { GalleryItem } from '../types';
import { SITE } from '../seo/siteConfig';
import { IntroController, ScrollMarquee } from '../motion';

export const HomePage: React.FC = () => {
  const [selectedGalleryImage, setSelectedGalleryImage] = useState<GalleryItem | null>(null);

  // "Book appointment" opens the shared panel over this page. It is a query on
  // the current path, so nothing navigates away and Back closes it.
  //
  // #contact is where the clinic's address and phone are, a different question.
  const { path, navigate } = useRouter();
  const openBooking = () => navigate(bookingHref(path));

  // Every "book this" control sends the visitor to the service tiles, because
  // that is the only place a booking can now be made -- each tile opens its own
  // form. These used to stash a prefill string and scroll to a standalone form
  // that no longer exists, which would have left them setting state nobody read
  // and scrolling to the footer.

  const publicServiceCodes = usePublicServiceCodes();

  const handleBookWithSpecialist = () => openBooking();


  return (
    <div className="min-h-screen bg-(--c-bg) text-(--c-ink) font-(family-name:--f-body) selection:bg-(--c-ink) selection:text-white flex flex-col">
      {/* Ends the intro overlay (home only). The rest of the motion layer
          is mounted site-wide in App. */}
      <IntroController />

      {/* Top Navigation Bar */}
      <Navbar
        onOpenBooking={openBooking}
      />

      {/* Main Content */}
      <main className="flex-grow">
        <Hero
          onOpenBooking={openBooking}
        />

        {/* Oversized drifting type, after the reference site's scroll
            marquees: speeds up with the scroll and turns with it. */}
        <div className="py-10 sm:py-14 border-y border-(--c-line)/30 bg-(--c-bg) overflow-hidden">
          <ScrollMarquee
            text="Life is movement — movement is life —"
            className="font-(family-name:--f-display) font-light text-(--c-ink) text-[64px] sm:text-[110px] lg:text-[150px] leading-none tracking-tight"
          />
          <ScrollMarquee
            text="Physiotherapy · Hydrotherapy · Acupuncture · Home visits ·"
            baseSpeed={-2}
            outline
            className="mt-2 font-(family-name:--f-display) font-light text-[40px] sm:text-[64px] lg:text-[84px] leading-none tracking-tight"
          />
        </div>

        <TrustMetrics />

        {/* Services before Conditions: lead with what the clinic offers, then
            what it treats, and let the journey explain how a course of it runs.
            TreatmentJourney moved down with them rather than staying put --
            it describes the process that follows both, so sitting between them
            would have split "what we do" from "what we treat". */}
        <ServicesSection />

        <ConditionsSection />

        <TreatmentJourney />

        <SuccessStories />

        {/* Split-doors reveal: the heading parts to uncover the clinician. */}
        <SplitDoorsReveal>
          <SpecialistsSection onOpenBookingWithSpecialist={handleBookWithSpecialist} />
        </SplitDoorsReveal>

        <GallerySection
          onSelectImage={(item) => setSelectedGalleryImage(item)}
        />

        <BookableServices availableCodes={publicServiceCodes} />

        {/* No standalone contact block here any more.

            Once the booking form moved into the service cards, all this held
            was a single narrow column of address lines under a full section's
            top and bottom padding -- a screen of empty page for four lines of
            text. The address, phone and hours moved to the footer, which now
            carries the id="contact" the nav links to. */}

        {/* FAQs sit after booking, not before it.

            They answered "do I need a referral?" and "does insurance cover
            this?" -- worth reading, but they were standing between a visitor
            who had decided and the thing they decided to do. Questions belong
            after the ask, for the people who still have one. */}
        <FaqSection />
      </main>

      {/* No <NapBlock /> here, deliberately.

          It exists to put name/address/phone in crawlable text, and on the
          detail pages (via PageShell) it is the only thing that does. The home
          page carries the same three facts in the footer, which renders
          formattedAddress() and the phone from the same siteConfig source. */
      }

      {/* Closing drift above the footer, carrying the clinic's own tagline. */}
      <div className="py-10 sm:py-14 bg-(--c-bg) border-t border-(--c-line)/30 overflow-hidden">
        <ScrollMarquee
          text={`${SITE.tagline} —`}
          baseSpeed={2.5}
          outline
          className="font-(family-name:--f-display) font-light text-[56px] sm:text-[96px] lg:text-[128px] leading-none tracking-tight"
        />
      </div>

      {/* Footer */}
      <Footer />

      {/* Overlays. Not the content cards -- those are pages now. */}
      <LightboxModal
        item={selectedGalleryImage}
        onClose={() => setSelectedGalleryImage(null)}
      />

      <BookingPanel availableCodes={publicServiceCodes} />
    </div>
  );
};
