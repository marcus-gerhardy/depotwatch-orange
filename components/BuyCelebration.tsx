"use client";

// The buy flash (CLAUDE.md §5.1): a short firework when a purchase is recorded
// by hand.
//
// It sits under the same rule as every other playful touch — it may not get in
// the way of using the app seriously. So it takes no pointer, moves nothing in
// the layout, changes no number, lasts under two seconds and goes on its own;
// `settings.easterEggs` switches it off entirely, and anyone who asked for less
// motion gets the coin and the figure standing still instead of the burst.
//
// What it deliberately does *not* do is watch the ledger for new buys. The
// store is told by the transaction dialog (`celebrateBuy`), which is the only
// place a purchase is entered one at a time. An import of five hundred rows, a
// correction to an old buy, or opening a file with ten years of history in it
// would each otherwise set off a firework — the first as five hundred of them.

import { useEffect, useMemo } from "react";
import { useI18n, intlLocale } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { useEasterEggs } from "@/lib/easterEggs";
import { useAmountFormat } from "@/lib/displayUnit";
import { formatFiat } from "@/lib/decimal";
import Confetti from "./Confetti";

/**
 * Everything about the timing, so it can be tuned in one place — long enough
 * to be watched, short enough that nobody waits for it: the burst is over in
 * under a second, and the rest is the coin standing there while the confetti
 * comes down behind it.
 */
const DURATION_MS = 4600;
/**
 * The two entrances, behind `motion-safe:` like every other one in the app.
 *
 * The duration is spelled out because Tailwind scans the source for whole
 * class names and would find nothing in an interpolated one — a test holds
 * these to DURATION_MS, so the coin can never outlive or undercut the flash.
 */
const COIN_IN =
  "motion-safe:animate-[buy-coin_4600ms_cubic-bezier(0.16,1,0.3,1)_forwards]";
const LABEL_IN = "motion-safe:animate-[buy-label_4600ms_ease-out_forwards]";
/** Sparks per wave. Two waves, offset, which is what makes it read as one. */
const SPARKS = 18;
const WAVES = 2;
/**
 * The confetti behind it all. Fewer pieces than the whole coin gets, spread
 * over more than twice its start window: a purchase *rains* for as long as the
 * coin stands there, where the whole coin dumps its confetti at once. So the
 * two read as the same family without the everyday event stealing the rare
 * one's moment.
 *
 * The last piece starts at SPREAD and lands FALL later — together they are
 * just under DURATION_MS, so the rain ends as the coin leaves rather than
 * being cut off in mid-air.
 */
const CONFETTI_PIECES = 52;
const CONFETTI_FALL_MS = 2600;
const CONFETTI_SPREAD_MS = 2000;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export default function BuyCelebration() {
  const { t, locale } = useI18n();
  const eggs = useEasterEggs();
  const flash = useAppStore((s) => s.buyFlash);
  const clear = useAppStore((s) => s.clearBuyFlash);
  const privacyMode = useAppStore((s) => s.privacyMode);
  const { formatWithUnit } = useAmountFormat();
  const currency = useAppStore((s) => s.portfolio?.settings.currencyDisplay) ?? "EUR";

  // Cleared either way: with the touches off there is nothing to show, and a
  // flash left lying in the state would play on the next file that is opened.
  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(clear, eggs ? DURATION_MS + 300 : 0);
    return () => clearTimeout(timer);
  }, [flash, eggs, clear]);

  if (!flash || !eggs) return null;
  // Only ever reached after a click, never during the prerender — where there
  // is no flash and therefore nothing rendered that could differ (the same
  // shape Celebration.tsx uses for the whole-coin confetti).
  const reduced = prefersReducedMotion();

  // The ledger records EUR (§3.2). Shown only where EUR is also what is on
  // display: converting it here would mean quoting a rate, and a decoration
  // has no business being the place a figure first appears in another
  // currency.
  const total =
    flash.totalFiatEur !== null && currency === "EUR"
      ? formatFiat(flash.totalFiatEur, "EUR", intlLocale(locale))
      : null;

  return (
    <div
      // Above the dialog it was triggered from, and unable to take a click:
      // the transaction table behind it stays usable throughout.
      className="pointer-events-none fixed inset-0 z-[70] flex items-center justify-center overflow-hidden"
      role="status"
      aria-live="polite"
    >
      {/* Behind the coin and across the whole screen: it falls from above the
          viewport, so it has to hang off the overlay rather than off the
          centred stack. */}
      {!reduced && (
        <Confetti
          key={`confetti-${flash.id}`}
          pieces={CONFETTI_PIECES}
          durationMs={CONFETTI_FALL_MS}
          spreadMs={CONFETTI_SPREAD_MS}
        />
      )}
      <div key={flash.id} className="relative flex flex-col items-center">
        {/* The burst is centred on the *coin*, not on the coin and its label
            together — off-centre by half a caption is exactly what makes a
            firework look like a mistake. */}
        <div className="relative flex items-center justify-center">
          {!reduced && <Firework />}
          <BitcoinCoin className={`relative h-24 w-24 ${reduced ? "" : COIN_IN}`} />
        </div>
        <div
          className={`relative mt-4 rounded-xl border border-accent/40 bg-surface/95 px-4 py-2 text-center shadow-2xl ${
            reduced ? "" : LABEL_IN
          }`}
        >
          <p className="font-heading text-sm font-semibold text-accent">
            {t("celebration.buyTitle")}
          </p>
          {/* Privacy mode hides amounts everywhere else, and a figure the size
              of a headline is the last place to make an exception. */}
          {!privacyMode && (
            <p className="mt-0.5 font-mono text-xs text-muted">
              +&nbsp;{formatWithUnit(flash.amountBtc)}
              {total !== null && <span className="ml-2">{total}</span>}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The burst: two waves of sparks flying outward from behind the coin, each
 * wave preceded by a ring going with them.
 *
 * Drawn with CSS transforms on plain elements — no canvas, no library, and
 * nothing that could survive its own animation: the whole thing is removed
 * from the DOM when the flash is cleared.
 */
function Firework() {
  const sparks = useMemo(
    () =>
      Array.from({ length: SPARKS * WAVES }, (_, i) => {
        const wave = Math.floor(i / SPARKS);
        const n = i % SPARKS;
        // Half a step of rotation between the waves, so the second one fills
        // the gaps of the first instead of retracing it.
        const angle = (360 / SPARKS) * n + wave * (180 / SPARKS);
        return {
          angle,
          // Deterministic rather than random: the same buy looks the same on
          // every render, and there is no clock or entropy in the render path.
          distance: 100 + ((n * 37) % 70) + wave * 45,
          delay: wave * 180 + ((n * 23) % 90),
          duration: 900 + ((n * 31) % 300),
          length: 14 + ((n * 17) % 12),
        };
      }),
    [],
  );

  return (
    <div aria-hidden className="absolute inset-0 flex items-center justify-center">
      {Array.from({ length: WAVES }, (_, w) => (
        <span
          key={`ring-${w}`}
          className="buy-ring"
          style={{ animationDelay: `${w * 180}ms` }}
        />
      ))}
      {sparks.map((s, i) => (
        <span
          key={i}
          className="buy-spark"
          style={{
            height: s.length,
            animationDelay: `${s.delay}ms`,
            animationDuration: `${s.duration}ms`,
            ["--spark-angle" as string]: `${s.angle}deg`,
            ["--spark-distance" as string]: `${s.distance}px`,
          }}
        />
      ))}
    </div>
  );
}

/**
 * The bitcoin sign on its coin — the original mark, tilted the way it always
 * is, drawn rather than typed.
 *
 * Drawn for the same reason everything else in the app is (§5): U+20BF is in
 * none of the three bundled fonts, so the character would be at the mercy of
 * whatever the device fell back to. And it is the *only* place the bitcoin
 * sign appears: the app's own mark is the block (components/BrandMark.tsx),
 * and the two must not be confused — this one stands for what was bought, not
 * for the app.
 *
 * The colours are the theme's accent and the text colour that goes on it, not
 * the logo's own orange: an effect that brought its own colour would be the
 * one thing on screen that ignores the theme, and in the two light themes it
 * would be the one thing that cannot be read. In the default theme, and in the
 * Bitcoin one, that accent *is* #F7931A.
 */
function BitcoinCoin({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden className={`buy-coin-glow ${className}`}>
      <circle cx="32" cy="32" r="30" fill="var(--accent)" />
      <g
        transform="rotate(13.5 32 32)"
        fill="none"
        stroke="var(--accent-contrast)"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* The stem, and the two bowls hanging off it. */}
        <path d="M23 18v28" />
        <path d="M23 18h11a7 7 0 0 1 0 14H23" />
        <path d="M23 32h13a7 7 0 0 1 0 14H23" />
        {/* The four prongs that make a B a bitcoin sign. */}
        <path d="M28 12v6M35 12v6M28 46v6M35 46v6" />
      </g>
    </svg>
  );
}
