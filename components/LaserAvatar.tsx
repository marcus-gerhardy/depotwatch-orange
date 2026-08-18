"use client";

// The laser eyes (CLAUDE.md §5.1).
//
// The meme is a face with two star flares burnt into it, and both halves
// matter: a flare needs eyes to sit in, and the block mark has none. So the
// unlocked logo
// becomes the placeholder avatar everybody knows from a login screen — just the
// contours of a head and a pair of shoulders — with the flares on it.
//
// The flare is what the pictures actually show: a white-hot core, long
// horizontal spikes and shorter vertical ones, and a soft halo that bleeds
// across the face where the two overlap. Drawn, not photographed, and drawn in
// the theme's accent plus white and nothing else, so it burns in all nine
// themes; on the two Bitcoin-orange ones it lands where the meme lives.

import { useId } from "react";

/** Horizontal and vertical reach of a flare's spikes, and its core radius. */
const SPIKE_X = 15;
const SPIKE_Y = 7.5;
const CORE_R = 2.6;
const HALO_R = 11;

/** The eyes of the placeholder face, in the viewBox below. */
const EYES = [
  { x: 26.5, y: 25 },
  { x: 37.5, y: 25 },
];

/** A four-pointed star: pointed tips, waisted middle. */
function spikePath(x: number, y: number): string {
  const w = 2.4;
  return [
    `M${x - SPIKE_X},${y}`,
    `Q${x - w},${y - w} ${x},${y - SPIKE_Y}`,
    `Q${x + w},${y - w} ${x + SPIKE_X},${y}`,
    `Q${x + w},${y + w} ${x},${y + SPIKE_Y}`,
    `Q${x - w},${y + w} ${x - SPIKE_X},${y}`,
    "Z",
  ].join(" ");
}

export default function LaserAvatar({ className = "" }: { className?: string }) {
  // Several of these can be on the page at once (the header, a settings row),
  // and two elements answering to the same gradient id is a bug waiting to be
  // debugged.
  const uid = useId().replace(/:/g, "");
  const halo = `halo-${uid}`;
  const spike = `spike-${uid}`;
  const bloom = `bloom-${uid}`;

  return (
    <svg viewBox="0 0 64 64" aria-hidden className={className}>
      <defs>
        <radialGradient id={halo}>
          <stop offset="0" style={{ stopColor: "var(--accent)", stopOpacity: 0.85 }} />
          <stop offset="0.45" style={{ stopColor: "var(--accent)", stopOpacity: 0.35 }} />
          <stop offset="1" style={{ stopColor: "var(--accent)", stopOpacity: 0 }} />
        </radialGradient>
        {/* White at the waist, the accent out towards the tips. */}
        <radialGradient id={spike}>
          <stop offset="0" stopColor="#fff" stopOpacity="1" />
          <stop offset="0.3" stopColor="#fff" stopOpacity="0.95" />
          <stop offset="0.65" style={{ stopColor: "var(--accent)", stopOpacity: 0.95 }} />
          <stop offset="1" style={{ stopColor: "var(--accent)", stopOpacity: 0.25 }} />
        </radialGradient>
        <filter id={bloom} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="0.9" />
        </filter>
      </defs>

      {/* The placeholder face: contours only, in the colour it inherits. */}
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.75"
      >
        <circle cx="32" cy="32" r="29.5" opacity="0.5" />
        <circle cx="32" cy="24" r="11.5" />
        <path d="M13.5 55.5a18.5 18.5 0 0 1 37 0" />
      </g>

      {/* The halos first and wide, so the two bleed into one band across the
          eyes the way they do on a photo. */}
      {EYES.map(({ x, y }) => (
        <circle key={`h${x}`} cx={x} cy={y} r={HALO_R} fill={`url(#${halo})`} />
      ))}

      <g filter={`url(#${bloom})`}>
        {EYES.map(({ x, y }) => (
          <path key={`s${x}`} d={spikePath(x, y)} fill={`url(#${spike})`} />
        ))}
      </g>

      {/* The cores last: nothing may sit on top of them, they are the hottest
          thing in the picture. */}
      {EYES.map(({ x, y }) => (
        <g key={`c${x}`}>
          <circle cx={x} cy={y} r={CORE_R} fill="#fff" opacity="0.55" />
          <circle cx={x} cy={y} r={CORE_R * 0.55} fill="#fff" />
        </g>
      ))}
    </svg>
  );
}
