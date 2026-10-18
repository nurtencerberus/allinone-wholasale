"use client";

import { useState } from "react";

export function ProductGallery({
  images,
  name,
  badge,
}: {
  images: string[];
  name: string;
  badge?: string;
}) {
  const gallery = images.length ? images : ["/images/cat-supplements.jpg"];
  const [active, setActive] = useState(0);

  return (
    <div>
      <div className="relative overflow-hidden rounded-xl border border-ink/10 bg-parchment">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={gallery[active]}
          alt={`${name} — image ${active + 1}`}
          className="aspect-square w-full object-cover"
        />
        {badge ? (
          <span className="absolute left-4 top-4 rounded-full bg-ink/85 px-3 py-1.5 text-[9.5px] font-bold tracking-[0.1em] text-cream uppercase backdrop-blur">
            {badge}
          </span>
        ) : null}
        <span className="absolute bottom-4 right-4 rounded-full bg-cream/95 px-3 py-1 text-[9.5px] font-bold tracking-[0.1em] text-ink/60 uppercase">
          Actual packaging may vary by lot
        </span>
      </div>
      {gallery.length > 1 ? (
        <div className="mt-3 grid grid-cols-4 gap-3">
          {gallery.map((image, index) => (
            <button
              key={image + index}
              type="button"
              onClick={() => setActive(index)}
              aria-label={`View image ${index + 1}`}
              className={`overflow-hidden rounded-lg border transition-all ${
                active === index ? "border-ink ring-1 ring-ink/20" : "border-ink/10 opacity-70 hover:opacity-100"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image} alt="" className="aspect-square w-full object-cover" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
