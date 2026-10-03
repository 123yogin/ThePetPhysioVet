import React from 'react';
import { ChevronRight } from 'lucide-react';
import { Link } from '../seo/router';

interface BreadcrumbsProps {
  trail: Array<{ name: string; path: string }>;
  /**
   * Max width of the content below, so the trail lines up with it. The legal
   * pages are a centred 760px reading column; a trail pinned to the 1280px
   * container floated far out to their left, looking like it belonged to a
   * different page.
   */
  maxWidthClass?: string;
}

/**
 * Visible breadcrumb trail. Mirrors the BreadcrumbList JSON-LD exactly — the two
 * are generated from the same `getPageMeta().breadcrumbs` array, so markup can
 * never claim a trail the user cannot see.
 */
export const Breadcrumbs: React.FC<BreadcrumbsProps> = ({ trail, maxWidthClass = 'max-w-[1280px]' }) => {
  if (trail.length < 2) return null;

  return (
    <nav aria-label="Breadcrumb" className={`w-full ${maxWidthClass} mx-auto px-4 sm:px-8 pt-8 pb-6`}>
      <ol className="flex flex-wrap items-center gap-1.5 text-xs font-(family-name:--f-body) text-(--c-body)">
        {trail.map((crumb, index) => {
          const isLast = index === trail.length - 1;
          return (
            <li key={`${crumb.path}-${index}`} className="flex items-center gap-1.5">
              {isLast ? (
                <span aria-current="page" className="text-(--c-ink) font-medium">
                  {crumb.name}
                </span>
              ) : (
                <>
                  <Link to={crumb.path} className="hover:text-(--c-accent) transition-colors uppercase tracking-wider">
                    {crumb.name}
                  </Link>
                  <ChevronRight className="w-3 h-3 text-(--c-line)" aria-hidden="true" />
                </>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};
