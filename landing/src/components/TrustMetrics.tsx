import React from 'react';
import { CountUp, useStagger } from '../motion';

export const TrustMetrics: React.FC = () => {
  const metrics = [
    { number: '500+', label: 'Happy Pets Restored' },
    { number: '10k', label: 'Therapy Sessions Completed' },
    { number: '2+', label: 'Years Clinical Experience' },
    { number: '98%', label: 'Patient Success Rate' },
  ];

  const gridRef = useStagger<HTMLDivElement>({ step: 120 });

  return (
    <section className="py-16 sm:py-24 bg-(--c-card) border-b border-(--c-line)/20">
      <div ref={gridRef} className="max-w-[1280px] mx-auto px-4 sm:px-8 grid grid-cols-2 md:grid-cols-4 gap-8 sm:gap-12 text-center">
        {metrics.map((item, idx) => (
          <div key={idx} className="flex flex-col items-center group">
            <span className="font-(family-name:--f-display) text-4xl sm:text-5xl lg:text-6xl text-(--c-ink) mb-2 sm:mb-4 font-light tracking-tight group-hover:scale-105 transition-transform">
              <CountUp value={item.number} />
            </span>
            <span className="font-(family-name:--f-body) text-xs sm:text-sm uppercase tracking-widest text-(--c-body) font-medium max-w-[160px]">
              {item.label}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
};
