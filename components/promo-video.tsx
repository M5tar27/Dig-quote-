"use client";

import { useState } from "react";

const VIDEOS = {
  en: { src: "/promo-video-en.mp4", label: "English" },
  es: { src: "/promo-video-es.mp4", label: "Español" },
} as const;

type Lang = keyof typeof VIDEOS;

export function PromoVideo() {
  const [lang, setLang] = useState<Lang>("en");

  return (
    <section className="container pb-16">
      <div className="mx-auto max-w-md text-center">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">See it in action</h2>
        <p className="mt-3 text-muted-foreground">
          From site photos to a client-ready quote — watch the whole thing happen in under a minute.
        </p>
      </div>

      <div className="mx-auto mt-6 flex w-fit items-center gap-1 rounded-full border bg-secondary/40 p-1">
        {(Object.keys(VIDEOS) as Lang[]).map((key) => (
          <button
            key={key}
            onClick={() => setLang(key)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              lang === key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {VIDEOS[key].label}
          </button>
        ))}
      </div>

      <div className="mx-auto mt-6 max-w-[280px]">
        <div className="overflow-hidden rounded-[2.5rem] border-8 border-neutral-900 shadow-2xl">
          {/* key={lang} forces a fresh <video> element on language switch, so it
              doesn't keep playing the old language mid-scene */}
          <video
            key={lang}
            className="aspect-[9/16] w-full object-cover"
            src={VIDEOS[lang].src}
            controls
            playsInline
            preload="metadata"
          />
        </div>
      </div>
    </section>
  );
}
