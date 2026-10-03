import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import {Menu, X, Calendar, ChevronRight } from 'lucide-react';
import { SUCCESS_STORIES } from '../data/clinicData';
import { Roll, useScrollSpin } from '../motion';
import { onFrame, track } from '../motion/engine';
import { useLab } from '../lab/Lab';

interface NavbarProps {
  onOpenBooking: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenBooking }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [activeSection, setActiveSection] = useState('home');

  // Scroll state from the motion engine: section positions are cached (and
  // re-measured only on resize), and React state is set only when the active
  // section or the scrolled flag actually changes. The previous handler read
  // ten sections' offsetTop/offsetHeight on every scroll event.
  useEffect(() => {
    // Document order, not menu order -- the first section containing the
    // scroll position wins, so this has to track the page.
    const ids = ['home', 'services', 'conditions', 'journey', 'success', 'about', 'gallery', 'book', 'faqs', 'contact'];
    const tracked = ids
      .map((id) => ({ id, el: document.getElementById(id) }))
      .filter((x): x is { id: string; el: HTMLElement } => !!x.el)
      .map((x) => ({ id: x.id, t: track(x.el) }));
    let lastActive = '';
    let lastScrolled: boolean | null = null;
    const stop = onFrame((f) => {
      const isScrolled = f.scrollY > 20;
      if (isScrolled !== lastScrolled) {
        lastScrolled = isScrolled;
        setScrolled(isScrolled);
      }
      const pos = f.scrollY + 120;
      const hit = tracked.find(({ t }) => {
        const b = t.box();
        return pos >= b.top && pos < b.top + b.height;
      });
      if (hit && hit.id !== lastActive) {
        lastActive = hit.id;
        setActiveSection(hit.id);
      }
    });
    return () => {
      stop();
      tracked.forEach(({ t }) => t.release());
    };
  }, []);

  // "Stories" is conditional: the section it targets hides itself when there
  // are no real success stories, and a nav item that scrolls to nothing is a
  // dead control in both the desktop bar and the mobile drawer below. It comes
  // back on its own as soon as SUCCESS_STORIES has an entry.
  const navLinks = [
    { label: 'Home', href: '/#home', id: 'home' },
    { label: 'Services', href: '/#services', id: 'services' },
    { label: 'Conditions', href: '/#conditions', id: 'conditions' },
    ...(SUCCESS_STORIES.length > 0
      ? [{ label: 'Stories', href: '/#success', id: 'success' }]
      : []),
    { label: 'About', href: '/#about', id: 'about' },
    { label: 'Gallery', href: '/#gallery', id: 'gallery' },
    { label: 'FAQs', href: '/#faqs', id: 'faqs' },
    { label: 'Contact', href: '/#contact', id: 'contact' },
  ];

  // The nav is `position: fixed`, so it takes no space in flow and the hero has
  // to leave room for it. That gap used to be a hardcoded `pt-24`, which was
  // right for the 85px mobile bar and wrong for the 113px desktop one — the
  // hero's own `lg:py-0` then removed it entirely and the "Certified
  // Veterinary Rehabilitation Center" badge sat 18px underneath the nav.
  //
  // Publishing the real measured height means the two cannot drift: the bar
  // also shrinks on scroll, and any future change to its padding or logo size
  // is picked up automatically rather than needing a matching edit elsewhere.
  const navRef = useRef<HTMLElement>(null);
  // The mark turns a quarter turn per screen of scroll.
  const logoRef = useScrollSpin<HTMLImageElement>(90);
  // Lab: 'pill' floats the bar as a rounded capsule inset from the edges.
  const { nav } = useLab();
  const pill = nav === 'pill';
  useLayoutEffect(() => {
    const el = navRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const publish = () =>
      document.documentElement.style.setProperty('--nav-h', `${el.offsetHeight}px`);
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <nav ref={navRef} className={pill
      ? `text-(--c-ink) font-(family-name:--f-body) fixed z-50 top-3 inset-x-3 sm:inset-x-5 lg:inset-x-0 lg:mx-auto lg:max-w-[1240px] rounded-[28px] border border-(--c-line)/50 bg-(--c-bg)/80 backdrop-blur-xl transition-all duration-300 ${
          scrolled ? 'shadow-[0_12px_40px_-18px_rgba(60,33,23,0.35)] py-1' : 'shadow-[0_8px_30px_-20px_rgba(60,33,23,0.25)] py-1.5'
        }`
      : `bg-(--c-bg)/95 backdrop-blur-md text-(--c-ink) font-(family-name:--f-body) fixed top-0 w-full z-50 transition-all duration-300 border-b ${
          scrolled ? 'border-(--c-line)/40 shadow-xs py-2' : 'border-(--c-line)/20 py-3.5 sm:py-4'
        }`}>
      <div className={`flex justify-between items-center w-full px-4 sm:px-6 lg:px-8 max-w-[1280px] mx-auto gap-2 sm:gap-4 ${pill ? 'h-14 lg:h-16' : 'h-14 sm:h-16 lg:h-20'}`}>
        {/* Brand Logo */}
        <a 
          href="/#home" 
          className="font-(family-name:--f-display) text-lg sm:text-xl lg:text-2xl font-light text-(--c-ink) flex items-center gap-2 tracking-tight group shrink-0 whitespace-nowrap"
        >
          <img
            ref={logoRef}
            // A 96/144px raster of the same artwork: identical at 36px, and
            // ~5 KB instead of ~39 KB for the traced SVG. The SVG stays for
            // the large intro mark, where its detail is visible.
            src="/logo-96.webp"
            srcSet="/logo-96.webp 96w, /logo-144.webp 144w"
            sizes="36px"
            alt=""
            aria-hidden="true"
            width={36}
            height={36}
            className="w-8 h-8 sm:w-9 sm:h-9 shrink-0 group-hover:scale-105 transition-transform"
          />
          <span className="font-medium whitespace-nowrap tracking-tight">The Pet Physio Vet</span>
        </a>

        {/* Navigation Links (Desktop) */}
        <div className="hidden lg:flex items-center gap-3 xl:gap-6 2xl:gap-7 shrink-0">
          {navLinks.map((link) => (
            <a
              key={link.id}
              href={link.href}
              className={`uppercase tracking-widest text-[11px] xl:text-xs font-medium transition-all hover:opacity-100 relative py-1 whitespace-nowrap ${
                activeSection === link.id ? 'text-(--c-ink) font-semibold' : 'text-(--c-body) opacity-80 hover:text-(--c-ink)'
              }`}
            >
              <Roll>{link.label}</Roll>
              {activeSection === link.id && (
                <span className="absolute bottom-0 left-0 w-full h-[2px] bg-(--c-ink)" />
              )}
            </a>
          ))}
        </div>

        {/* Trailing Actions */}
        <div className="hidden lg:flex items-center gap-2.5 xl:gap-3 shrink-0">
          
          <button
            data-magnetic
            onClick={onOpenBooking}
            className="inline-flex items-center gap-1.5 xl:gap-2 bg-(--c-ink) text-(--c-card) px-4 xl:px-6 py-2 xl:py-2.5 rounded-none hover:bg-(--c-body) transition-colors duration-300 uppercase tracking-widest text-[11px] xl:text-xs font-medium cursor-pointer whitespace-nowrap"
          >
            <Calendar className="w-3.5 h-3.5" />
            <Roll>Book Appointment</Roll>
          </button>
        </div>

        {/* Mobile / Tablet Menu Toggle */}
        <div className="flex lg:hidden items-center gap-2 shrink-0">
          {/* Stays "Book" at phone width. "Book Appointment" measures ~158px
              here and the nav row has ~100px to spare, so the full label would
              push the row into the logo. The accessible name carries the whole
              phrase regardless, so a screen reader is not left with a bare verb. */}
          <button
            onClick={onOpenBooking}
            aria-label="Book Appointment"
            className="bg-(--c-ink) text-(--c-card) px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider rounded-none cursor-pointer"
          >
            Book
          </button>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-1.5 text-(--c-ink) hover:bg-(--c-surface-2) transition-colors cursor-pointer"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile / Tablet Drawer Menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden bg-(--c-bg) border-b border-(--c-line)/40 px-6 py-6 shadow-xl animate-in slide-in-from-top duration-200 max-h-[85vh] overflow-y-auto">
          <div className="flex flex-col space-y-3">
            {navLinks.map((link) => (
              <a
                key={link.id}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`text-xs uppercase tracking-widest font-medium py-2.5 border-b border-(--c-line)/20 flex justify-between items-center ${
                  activeSection === link.id ? 'text-(--c-ink) font-semibold' : 'text-(--c-body)'
                }`}
              >
                <span>{link.label}</span>
                <ChevronRight className="w-4 h-4 text-(--c-accent)" />
              </a>
            ))}

            <div className="pt-3 flex flex-col gap-2.5">

              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenBooking();
                }}
                className="w-full py-3 bg-(--c-ink) text-white uppercase tracking-widest text-xs font-medium cursor-pointer"
              >
                Book Consultation
              </button>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
};

