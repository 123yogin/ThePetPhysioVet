import React from 'react';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { useRouter } from '../seo/router';
import { getPageMeta } from '../seo/metadata';
import { BookingPanel, bookingHref } from '../components/BookingPanel';
import { usePublicServiceCodes } from '../hooks/usePublicServiceCodes';

/**
 * Layout for the standalone detail routes.
 *
 * Detail pages deliberately do NOT reuse the home layout. Rendering the whole
 * homepage behind a modal for every condition would create a set of near-duplicate
 * pages differing only by one block — the classic thin/duplicate template problem.
 * Each detail route gets its own unique main content instead.
 */
export const PageShell: React.FC<{
  children: React.ReactNode;
  /** Match the breadcrumb to a narrower reading column (the legal pages). */
  contentWidthClass?: string;
}> = ({ children, contentWidthClass }) => {
  const { path, navigate } = useRouter();
  const meta = getPageMeta(path);
  const publicServiceCodes = usePublicServiceCodes();

  return (
    <div className="min-h-screen bg-(--c-bg) text-(--c-ink) font-(family-name:--f-body) selection:bg-(--c-ink) selection:text-white flex flex-col">
      <Navbar onOpenBooking={() => navigate(bookingHref(path))} />
      {/* The navbar is position:fixed, so something has to reserve its height.
          That job used to belong, by accident, to the breadcrumb's pt-28 --
          and Breadcrumbs returns null for a trail shorter than two items. On
          the legal pages, which had no trail, nothing reserved the space and
          the <h1> rendered 33px underneath the navbar.

          --nav-h is published by Navbar from its own measured height, so this
          tracks the real bar through its scrolled and unscrolled states rather
          than hardcoding a number that drifts. */}
      <div style={{ paddingTop: 'var(--nav-h, 113px)' }}>
        <Breadcrumbs trail={meta.breadcrumbs} maxWidthClass={contentWidthClass} />
        <main className="flex-grow">{children}</main>
      </div>
      {/* No NapBlock here any more.

          It existed to put name/address/phone in crawlable text on the detail
          routes, back when the footer did not carry the hours and the map link.
          It does now, so the two stacked directly on top of each other: address,
          phone and "Monday - Friday 09:30 - 13:30" printed twice in one screen.

          The booking call to action it also carried is not lost either -- every
          detail page renders <DetailCta> inside its own content, where it sits
          after the thing the visitor came to read rather than below a second
          copy of the address. */}
      <Footer />

      {/* The appointment form, over this page. Booking used to throw the
          visitor back to the home page before showing a single field. */}
      <BookingPanel availableCodes={publicServiceCodes} />
    </div>
  );
};

/** Shared CTA used at the foot of every detail page. */
export const DetailCta: React.FC<{ label: string; prefill?: string }> = ({ label, prefill }) => {
  const { path, navigate } = useRouter();
  const bookHref = bookingHref(path, { reasonFor: prefill });
  return (
    <div className="mt-12 flex flex-col sm:flex-row gap-4">
      {/* Opens the form over this page, with the condition already written
          into it. The href and the click used to disagree here -- the link
          advertised "?reason=…" while navigate() threw it away and went to a
          bare "/#book" -- so the prefill never once reached the form, and the
          visitor lost the page they were reading on the way. */}
      <a
        href={bookHref}
        onClick={(event) => {
          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
          event.preventDefault();
          navigate(bookHref);
        }}
        className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-(--c-ink) text-white text-xs uppercase tracking-widest font-medium hover:bg-(--c-accent) transition-colors"
      >
        {label}
      </a>
      <a
        href="/#conditions"
        className="inline-flex items-center justify-center gap-2 px-7 py-3.5 border border-(--c-ink) text-(--c-ink) text-xs uppercase tracking-widest font-medium hover:bg-(--c-ink) hover:text-white transition-colors"
      >
        Browse all conditions
      </a>
    </div>
  );
};

/** Consistent bulleted list block used across detail templates. */
/** A titled list. Renders nothing at all when there is nothing to list --
 *  an empty array previously still drew the heading, leaving a section label
 *  floating above blank space. Handled here rather than at each call site so
 *  the condition and specialist pages get it too. */
export const FactList: React.FC<{ title: string; items: string[] }> = ({ title, items }) => (
  items.length === 0 ? null :
  <div>
    <h2 className="text-xs uppercase tracking-widest text-(--c-accent) font-semibold mb-4">{title}</h2>
    <ul className="space-y-2.5">
      {items.map((item) => (
        <li key={item} className="flex gap-3 font-(family-name:--f-body) text-sm text-(--c-body) font-light leading-relaxed">
          <span aria-hidden="true" className="mt-2 w-1 h-1 bg-(--c-accent) shrink-0" />
          {item}
        </li>
      ))}
    </ul>
  </div>
);
