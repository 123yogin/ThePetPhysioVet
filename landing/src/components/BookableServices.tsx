import React from 'react';
import { Activity, Waves, BedDouble, Sparkles, Footprints } from 'lucide-react';
import { BOOKABLE_SERVICES, BookableService } from '../data/bookableServices';
import { useRouter } from '../seo/router';
import { bookingHref } from './BookingPanel';
import { SplitWords, useStagger } from '../motion';
import { Pulse } from '../motion/extras';

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
 * Clicking a tile opens what that service includes; it does NOT jump to the
 * booking form. Tile size is the loudest signal on this section, so the visitor
 * gets to read before being asked for their phone number, and the Book button
 * lives inside the panel once they have.
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

const Tile: React.FC<{
  service: BookableService;
  href: string;
  onOpen: (href: string) => (event: React.MouseEvent) => void;
}> = ({ service, href, onOpen }) => {
  const Icon = ICONS[service.icon] ?? Activity;
  return (
  <a
    href={href}
    onClick={onOpen(href)}
    aria-label={`${service.title} — what's included`}
    data-cursor="Book"
    data-tilt
    className={`${PLACEMENT[service.code] ?? ''} group relative overflow-hidden text-left bg-(--c-surface) border border-(--c-line)/30 p-8 sm:p-10 min-h-[220px] flex flex-col justify-between hover:bg-white transition-colors duration-500`}
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

    <span className="icon-nudge relative text-(--c-accent) opacity-70 group-hover:opacity-100 transition-opacity">
      <Icon className="w-7 h-7" />
    </span>

    <span className="relative block">
      <span className="block font-(family-name:--f-display) text-2xl sm:text-3xl text-(--c-ink) font-light mb-2 group-hover:text-(--c-accent) transition-colors">
        {service.title}
      </span>
      <span className="block font-(family-name:--f-body) text-sm text-(--c-body) font-light leading-relaxed max-w-[42ch]">
        {service.summary}
      </span>

      {/* Price menu, on the card itself for services that have one (Swimming,
          Grooming). Informational — the visit is still reserved and paid at the
          clinic; see the booking panel. */}
      {service.priceList && (
        <span className="mt-4 block max-w-[42ch] border-t border-(--c-line)/30 pt-3">
          {service.priceList.map((p) => (
            <span
              key={p.label}
              className="flex justify-between gap-4 font-(family-name:--f-body) text-xs text-(--c-body) font-light py-1"
            >
              <span>{p.label}</span>
              <span className="text-(--c-ink) font-medium whitespace-nowrap">
                &#8377;{p.price.toLocaleString('en-IN')}
              </span>
            </span>
          ))}
        </span>
      )}

      <span className="mt-5 inline-block text-xs uppercase tracking-widest text-(--c-accent) font-semibold">
        What&rsquo;s included &rarr;
      </span>
    </span>
  </a>
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

  const offered = BOOKABLE_SERVICES.filter((s) => availableCodes.includes(s.code));
  if (offered.length === 0) return null;

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
            Pick a service to see what it includes and request it from there.
            Not sure which one your pet needs? Choose whichever looks closest,
            or call the clinic and we will advise.
          </p>
        </div>

        <div ref={tilesRef} className="grid grid-cols-1 lg:grid-cols-2 lg:grid-rows-3 gap-px bg-(--c-line)/20">
          {offered.map((s) => (
            <Tile
              key={s.code}
              service={s}
              href={bookingHref(path, { service: s.code })}
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
