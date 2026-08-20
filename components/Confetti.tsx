"use client";

// Orange confetti — the one implementation, shared by both celebrations
// (CLAUDE.md §5.1): the first whole coin, and a buy just recorded.
//
// CSS only: no library, no canvas, no layout impact, and nothing that could
// take a click — the caller's overlay is pointer-events-none and every piece
// is inside it. The colour is the theme's accent, so it falls in orange where
// the theme is orange and in the theme's own colour everywhere else.
//
// Anyone who asked for less motion never gets it rendered (both callers check
// that before mounting it, and `.confetti-piece` is hidden in the stylesheet
// as the second belt).

import { useMemo } from "react";
import { useThemeColors } from "@/lib/appearance";

export default function Confetti({
  pieces = 60,
  durationMs = 2600,
  /** How far apart the pieces start, so they rain rather than drop as a sheet. */
  spreadMs = 1000,
}: {
  pieces?: number;
  durationMs?: number;
  spreadMs?: number;
}) {
  const accent = useThemeColors().accent;
  const shapes = useMemo(
    () =>
      // Deterministic rather than random: nothing in the render path reads a
      // clock or entropy, so the same celebration looks the same every time.
      Array.from({ length: pieces }, (_, i) => ({
        left: (i * 97) % 100,
        delay: (((i * 37) % 100) / 100) * spreadMs,
        drift: ((i * 53) % 60) - 30,
        size: 5 + ((i * 13) % 5),
        spin: ((i * 71) % 2 === 0 ? 1 : -1) * (180 + ((i * 29) % 360)),
      })),
    [pieces, spreadMs],
  );

  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden">
      {shapes.map((p, i) => (
        <span
          key={i}
          className="confetti-piece"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 1.6,
            background: accent,
            opacity: 0.85,
            animationDelay: `${p.delay}ms`,
            animationDuration: `${durationMs}ms`,
            ["--confetti-drift" as string]: `${p.drift}px`,
            ["--confetti-spin" as string]: `${p.spin}deg`,
          }}
        />
      ))}
    </div>
  );
}
