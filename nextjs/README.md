# Prakash Watch Co. — Next.js homepage

Dark-theme demo homepage (App Router + TypeScript). Mirrors the HTML design prototype in this project.

## Run

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Structure

- `app/layout.tsx` — fonts (Instrument Serif / Jost / JetBrains Mono via next/font), metadata
- `app/globals.css` — design tokens (CSS variables), keyframes
- `app/page.tsx` — section composition
- `components/` — Nav, Hero, WatchFace (live IST analog), Marquee, Collection (hover-peek), Heritage, Service, Boutiques, Footer (live IST clock), Cursor, Reveal

## Media to drop in

Striped placeholder blocks mark where real photography/video goes — replace the `Collection` hover-peek backgrounds and consider a hero loop video (see chat notes).
