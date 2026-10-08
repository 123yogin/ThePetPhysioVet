import React, { useState } from 'react';
import { FAQS } from '../data/clinicData';
import { ChevronDown, Search, HelpCircle } from 'lucide-react';
import { SplitWords, useStagger } from '../motion';
import { Pulse } from '../motion/extras';

export const FaqSection: React.FC = () => {
  const [openId, setOpenId] = useState<string | null>('faq1');
  const [searchQuery, setSearchQuery] = useState('');

  const listRef = useStagger<HTMLDivElement>({ step: 80 });

  const toggleAccordion = (id: string) => {
    setOpenId(openId === id ? null : id);
  };

  const filteredFaqs = FAQS.filter(
    (faq) =>
      faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      faq.answer.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <section id="faqs" className="py-20 sm:py-28 bg-(--c-surface)">
      <div className="max-w-4xl mx-auto px-4 sm:px-8">
        
        {/* Header */}
        <div className="mb-12 text-center">
          <span className="text-xs uppercase tracking-widest text-(--c-accent) font-semibold mb-2 flex items-center gap-3 justify-center font-(family-name:--f-body)">
            <Pulse />
            Clear Guidance
          </span>
          <SplitWords className="font-(family-name:--f-display) text-3xl sm:text-4xl lg:text-5xl text-(--c-ink) font-light mb-4">Frequently Asked Questions</SplitWords>
          <p className="font-(family-name:--f-body) text-base text-(--c-body) font-light max-w-xl mx-auto">
            Everything you need to know about veterinary rehabilitation referrals, session expectations, and pet insurance coverage.
          </p>
        </div>

        {/* Search Input */}
        <div className="relative mb-10 max-w-md mx-auto">
          <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-(--c-mute)" />
          <input
            type="text"
            placeholder="Search questions (e.g., insurance, referral, length)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-4 py-3 bg-(--c-card) border border-(--c-line) text-(--c-ink) placeholder:text-(--c-mute) text-sm focus:outline-none focus:border-(--c-ink) transition-colors"
          />
        </div>

        {/* Accordions */}
        <div ref={listRef} className="space-y-4">
          {filteredFaqs.length > 0 ? (
            filteredFaqs.map((faq) => {
              const isOpen = openId === faq.id;
              return (
                <div
                  key={faq.id}
                  className="bg-(--c-card) border border-(--c-line)/40 transition-all"
                >
                  <h3>
                    <button
                      onClick={() => toggleAccordion(faq.id)}
                      aria-expanded={isOpen}
                      aria-controls={`${faq.id}-answer`}
                      className="w-full flex items-center justify-between p-6 text-left cursor-pointer group"
                    >
                      <span className="font-(family-name:--f-display) text-lg sm:text-xl text-(--c-ink) font-medium group-hover:text-(--c-accent) transition-colors pr-4">
                        {faq.question}
                      </span>
                      <span className={`p-1 text-(--c-ink) transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}>
                        <ChevronDown className="w-5 h-5" />
                      </span>
                    </button>
                  </h3>

                  {/* Always rendered, animated open and shut by its grid row
                      (0fr to 1fr), so the answer eases in rather than popping.
                      `inert` while closed keeps the hidden text out of the tab
                      order and away from screen readers. */}
                  <div
                    id={`${faq.id}-answer`}
                    inert={!isOpen}
                    className={`grid transition-[grid-template-rows,opacity] duration-500 ease-[cubic-bezier(0.2,0.7,0.2,1)] motion-reduce:transition-none ${
                      isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                    }`}
                  >
                    <div className="overflow-hidden">
                      <div className="px-6 pb-6 pt-2 font-(family-name:--f-body) text-sm sm:text-base text-(--c-body) font-light leading-relaxed border-t border-(--c-line)/20">
                        <p className="pl-4 border-l-2 border-(--c-accent)/50">
                          {faq.answer}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-center py-12 bg-(--c-card) p-8 border border-(--c-line)/40">
              <HelpCircle className="w-8 h-8 text-(--c-mute) mx-auto mb-3" />
              <p className="text-sm text-(--c-body)">Didn&rsquo;t find your question? Call or email us.</p>
            </div>
          )}
        </div>

      </div>
    </section>
  );
};
