import React from 'react';
import { Activity, Waves, BedDouble, Sparkles, Footprints } from 'lucide-react';
import { BOOKABLE_SERVICES, BookableService } from '../data/bookableServices';
import { Link, useRouter } from '../seo/router';
import { carePath, servicePath } from '../seo/routes';
import { bookingHref } from './BookingPanel';
import { SplitWords, useStagger } from '../motion';
import { Pulse } from '../motion/extras';
import { rupee } from '../lib/format';

/**
 * The bookable services as a bento grid.
 *
 * Two columns and three rows, with the indoor facility taking the tall tile.
 *
 *   ┌──────────────┬──────────────┐
 *   │ Physiotherapy│              │
 *   ├──────────────┤ Indoor Fac.  │
 *   │ Swimming     │              │
 *   ├──────────────┼──────────────┤
 *   │ Grooming     │ Walking      │
 *   └──────────────┴──────────────┘
 *
 * Placement is explicit per tile rather than relying on source order, because
 * the tall tile has to sit beside two short ones -- auto-flow would leave a
 * hole under it.
 *
 * Each tile shows what the service includes (and its prices, where it has
 * them) as static content, so the prerendered HTML carries every service. The
 * Book button opens the booking panel for that service and appears only when
 * the clinic's API lists the code as publicly bookable.
 *
 * Below `lg` the whole thing becomes one column. A two-column bento with row
 * spans cannot survive a 390px screen, and the size hierarchy simply does not
 * exist there -- order is the only signal left, so the tiles keep their order.
 */

interface BookableServicesProps {
  /** Codes the clinic currently offers publicly, from its own API. */
  availableCodes: string[];
}

type IconComponent = React.ComponentType<{ className?: string; strokeWidth?: number }>;

const ICONS: Record<string, IconComponent> = {
  activity: Activity,
  waves: Waves,
  bed: BedDouble,
  sparkles: Sparkles,
  footprints: Footprints,
};

/**
 * Grid placement per service.
 *
 * The wireframe put Physiotherapy in the tall slot, but the clinic has since
 * said the indoor facility is the thing it most wants shown -- residential care
 * for patients travelling in is what distinguishes it. Tile size is the loudest
 * signal in this section, so the tall slot follows that rather than the sketch.
 */
const PLACEMENT: Record<string, string> = {
  IndoorFacility: 'lg:col-start-2 lg:row-start-1 lg:row-span-2',
  Physiotherapy: 'lg:col-start-1 lg:row-start-1',
  Hydrotherapy: 'lg:col-start-1 lg:row-start-2',
  Grooming: 'lg:col-start-1 lg:row-start-3',
  Walking: 'lg:col-start-2 lg:row-start-3',
};

/**
 * Where each card's "read more" link goes. A plain crawlable href, so the
 * prerendered homepage links every bookable service to the page that covers it.
 * Grooming has no page of its own yet, so it carries no link.
 */
const DETAIL_LINKS: Record<string, { href: string; label: string }> = {
  IndoorFacility: { href: carePath('pet-boarding'), label: 'Pet boarding in Shilaj' },
  Physiotherapy: { href: '/#services', label: 'Treatment modalities' },
  Hydrotherapy: { href: servicePath('hydrotherapy'), label: 'Dog swimming pool & hydrotherapy' },
  Walking: { href: `${carePath('pet-boarding')}#dog-walking`, label: 'Dog walking' },
};

const Tile: React.FC<{
  service: BookableService;
  /** Booking href, or null when the live API does not (yet) offer this code. */
  bookHref: string | null;
  onOpen: (href: string) => (event: React.MouseEvent) => void;
}> = ({ service, bookHref, onOpen }) => {
  const Icon = ICONS[service.icon] ?? Activity;
  const detail = DETAIL_LINKS[service.code];
  const headingId = `book-${service.code.toLowerCase()}`;
  return (
  <article
    aria-labelledby={headingId}
    data-tilt
    className={`${PLACEMENT[service.code] ?? ''} group relative overflow-hidden text-left bg-(--c-surface) border border-(--c-line)/30 p-8 sm:p-10 min-h-[220px] flex flex-col justify-between gap-6 hover:bg-white transition-colors duration-500`}
  >
    {/* The tile's own icon again, oversized and very faint, as texture.

        This is deliberately NOT a photograph. Stock imagery under a tile that
        says "our indoor pool" or "our 24x7 facility" shows a room the clinic
        may not have, which is a claim about a real business rather than
        decoration. The clinic does not have its own photographs yet, so the
        tiles carry a mark instead of a place. Swap this for a real photo when
        they do.

        aria-hidden and pointer-events-none: it is the same icon already shown
        above, so announcing it twice is noise, and it must never swallow the
        click. */}
    <Icon
      aria-hidden="true"
      strokeWidth={1}
      className="pointer-events-none absolute -right-8 -bottom-10 w-48 h-48 text-(--c-accent) opacity-[0.06] group-hover:opacity-[0.10] transition-opacity duration-500"
    />

    <span aria-hidden="true" className="icon-nudge relative text-(--c-accent) opacity-70 group-hover:opacity-100 transition-opacity">
      <Icon className="w-7 h-7" />
    </span>

    <div className="relative">
      <h3 id={headingId} className="font-(family-name:--f-display) text-2xl sm:text-3xl text-(--c-ink) font-light mb-2">
        {service.title}
      </h3>
      <p className="font-(family-name:--f-body) text-sm text-(--c-body) font-light leading-relaxed max-w-[42ch]">
        {service.summary}
      </p>

      {/* What it includes, in the clinic's own words. Static content, so it is
          in the prerendered HTML whether or not the booking API answers. */}
      <ul className="mt-4 space-y-1.5 max-w-[42ch]">
        {service.includes.map((item) => (
          <li key={item} className="flex gap-2.5 font-(family-name:--f-body) text-xs text-(--c-body) font-light leading-relaxed">
            <span aria-hidden="true" className="mt-1.5 w-1 h-1 bg-(--c-accent) shrink-0" />
            {item}
          </li>
        ))}
      </ul>

      {/* Price menu, on the card itself for services that have one (Swimming,
          Grooming). Informational -- the visit is still reserved and paid at the
          clinic; see the booking panel. */}
      {service.priceList && (
        <dl className="mt-4 block max-w-[42ch] border-t border-(--c-line)/30 pt-3">
          {service.priceList.map((p) => (
            <div
              key={p.label}
              className="flex justify-between gap-4 font-(family-name:--f-body) text-xs text-(--c-body) font-light py-1"
            >
              <dt>{p.label}</dt>
              <dd className="text-(--c-ink) font-medium whitespace-nowrap">
                {rupee(p.price)}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {/* Actions. The row keeps its height whether or not Book has arrived, so
          the live check never shifts the layout. Book is gated on the clinic's
          own /appointment-options: a retired code shows no Book button rather
          than a form the API would reject. The content above never depends on
          it. */}
      <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 min-h-11">
        {bookHref && (
          <a
            href={bookHref}
            onClick={onOpen(bookHref)}
            data-cursor="Book"
            aria-label={`Book ${service.title}`}
            className="inline-flex items-center justify-center min-h-11 px-5 bg-(--c-ink) text-(--c-bg) text-xs uppercase tracking-widest font-semibold hover:bg-(--c-accent) transition-colors"
          >
            Book &rarr;
          </a>
        )}
        {detail && (
          <Link
            to={detail.href}
            className="inline-flex items-center min-h-11 text-xs uppercase tracking-widest text-(--c-accent) font-semibold underline-offset-4 hover:underline"
          >
            {detail.label}
          </Link>
        )}
      </div>
    </div>
  </article>
  );
};

export const BookableServices: React.FC<BookableServicesProps> = ({ availableCodes }) => {
  // Tiles are links, not buttons with handlers. Opening the form is a URL
  // change on the CURRENT page (see BookingPanel), so a tile is just an anchor
  // to that URL -- which also makes each service's form shareable and lets the
  // browser's Back button close it.
  const { path, navigate } = useRouter();
  // `container` so every tile reveals together when the grid enters view — the
  // bento is three rows tall, and the per-tile default left the lower rows blank
  // while the top was on screen (the empty band under the cards).
  const tilesRef = useStagger<HTMLDivElement>({ step: 110, trigger: 'container' }, [availableCodes.join()]);

  // Every card renders from static data -- the prerendered page must carry
  // them, and crawlers never run the API call. Only Book depends on it.
  const offered = new Set(availableCodes);

  const open = (href: string) => (event: React.MouseEvent) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
    event.preventDefault();
    navigate(href);
  };

  return (
    <section id="book" className="py-20 sm:py-28 bg-(--c-bg)">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-8">
        <div className="mb-12 border-b border-(--c-line)/30 pb-8">
          <span className="text-xs uppercase tracking-widest text-(--c-accent) font-semibold mb-2 flex items-center gap-3 font-(family-name:--f-body)">
            <Pulse />
            Book a visit
          </span>
          <SplitWords className="font-(family-name:--f-display) text-3xl sm:text-4xl lg:text-5xl text-(--c-ink) font-light">What would you like to book?</SplitWords>
          <p className="font-(family-name:--f-body) text-base sm:text-lg text-(--c-body) font-light leading-relaxed mt-4 max-w-[60ch]">
            Physiotherapy, swimming, boarding and day care, grooming and walks
            at our Shilaj clinic. Not sure which one your pet needs? Choose
            whichever looks closest, or call the clinic and we will advise.
          </p>
        </div>

        <div ref={tilesRef} className="grid grid-cols-1 lg:grid-cols-2 lg:grid-rows-3 gap-px bg-(--c-line)/20">
          {BOOKABLE_SERVICES.map((s) => (
            <Tile
              key={s.code}
              service={s}
              bookHref={offered.has(s.code) ? bookingHref(path, { service: s.code }) : null}
              onOpen={open}
            />
          ))}
        </div>

        {/* The other route. Someone who does not know what their pet needs is
            exactly the person a clinic wants to hear from, and before this they
            had nowhere to go once the service-less form was removed -- "choose
            whichever looks closest" is a dead end at 11pm. A band rather than a
            sixth tile: the bento above is exactly filled, and this is a
            different kind of action, not another service. */}
        <a
          href={bookingHref(path)}
          onClick={open(bookingHref(path))}
          className="mt-px block w-full bg-(--c-surface) border border-(--c-line)/30 px-8 py-7 text-left hover:bg-white transition-colors duration-500 group"
        >
          <span className="block font-(family-name:--f-display) text-lg sm:text-xl text-(--c-ink) font-light mb-1 group-hover:text-(--c-accent) transition-colors">
            Not sure which one your pet needs?
          </span>
          <span className="block font-(family-name:--f-body) text-sm text-(--c-body) font-light">
            Tell us what is troubling them and we will advise when we call
            &nbsp;&rarr;
          </span>
        </a>
      </div>
    </section>
  );
};
