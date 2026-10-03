import React from 'react';
import { Link } from '../seo/router';

interface EntityCardLinkProps {
  /** Destination detail route. */
  href: string;
  className?: string;
  'aria-label'?: string;
  children: React.ReactNode;
}

/**
 * A card that goes to its page.
 *
 * It used to render a real <a href> and then preventDefault() a plain click to
 * open a modal instead, keeping the href purely so crawlers could find the
 * route. The effect was that only crawlers ever did: of 17 routes, 14 were
 * unreachable by ordinary clicking, and the pages -- which carry breadcrumbs,
 * their own titles and their own structured data -- were shown to search
 * engines and hidden from people.
 *
 * Three things made that the wrong trade:
 *
 *  - A modal has no URL. Referrals here travel by WhatsApp, and an owner told
 *    "your dog needs IVDD physio" cannot forward a modal.
 *  - Visitors arriving from search already landed on the page, so the same
 *    content had two different presentations depending on how you got there.
 *  - No modal pushed history, so Back on Android left the site instead of
 *    closing the overlay.
 *
 * Navigation is client-side via the app's own <Link>, so this is still a real
 * <a href> that works without JS and stays fast with it.
 *
 * The rule this settles, for the rest of the site: content goes to a page;
 * actions and media open an overlay. The booking panels (a form) and the
 * gallery lightbox (an image viewer) are the second kind and stay as they are.
 */
export const EntityCardLink: React.FC<EntityCardLinkProps> = ({
  href,
  className,
  children,
  ...rest
}) => (
  <Link to={href} className={className} {...rest}>
    {children}
  </Link>
);
