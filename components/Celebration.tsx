"use client";

// The first whole coin (CLAUDE.md §5.1): once, quietly, and never again.

import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { useEasterEggs } from "@/lib/easterEggs";
import { totalBalance } from "@/lib/portfolio";
import { flattenLedger } from "@/lib/types";
import { useThemeColors } from "@/lib/appearance";

/** Everything about the animation, so it can be tuned in one place. */
const PIECES = 60;
const DURATION_MS = 2600;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Watches the holding for the moment it first reaches one whole coin.
 *
 * The flag lives in the portfolio file, so the moment happens once per
 * portfolio rather than once per page load — and a file that is already above
 * one coin when it is opened simply records the flag without showing anything,
 * because that moment has passed. Anyone who has asked their system not to
 * animate gets the message without the motion.
 */
export default function Celebration() {
  const { t } = useI18n();
  const eggs = useEasterEggs();
  const portfolio = useAppStore((s) => s.portfolio);
  const celebrated = portfolio?.uiSettings?.wholecoinerCelebrated === true;
  const setCelebrated = useAppStore((s) => s.setWholecoinerCelebrated);
  const [shown, setShown] = useState(false);
  /** The balance when this portfolio was opened — the "was it already?" answer. */
  const startedAbove = useRef<boolean | null>(null);

  const balance = useMemo(
    () => (portfolio ? totalBalance(flattenLedger(portfolio.wallets)) : null),
    [portfolio],
  );
  const wholeCoin = balance !== null && balance.gte(1);

  useEffect(() => {
    if (balance === null) {
      startedAbove.current = null;
      return;
    }
    if (startedAbove.current === null) startedAbove.current = balance.gte(1);
  }, [balance]);

  useEffect(() => {
    if (!wholeCoin || celebrated) return;
    // Opened with a whole coin already there: remember it, show nothing.
    if (startedAbove.current !== false) {
      setCelebrated();
      return;
    }
    setShown(true);
    setCelebrated();
  }, [wholeCoin, celebrated, setCelebrated]);

  useEffect(() => {
    if (!shown) return;
    const timer = setTimeout(() => setShown(false), DURATION_MS + 400);
    return () => clearTimeout(timer);
  }, [shown]);

  if (!shown || !eggs) return null;
  const reduced = prefersReducedMotion();

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[60] flex items-start justify-center overflow-hidden pt-24"
      role="status"
      aria-live="polite"
    >
      {!reduced && <Confetti />}
      <div className="rounded-xl border border-accent/50 bg-surface/95 px-4 py-3 text-center shadow-2xl">
        <p className="font-heading text-sm font-semibold text-accent">
          {t("celebration.wholecoinerTitle")}
        </p>
        <p className="mt-0.5 text-xs text-muted">{t("celebration.wholecoinerBody")}</p>
      </div>
    </div>
  );
}

/** Orange confetti, CSS only — no library, no canvas, no layout impact. */
function Confetti() {
  const accent = useThemeColors().accent;
  const pieces = useMemo(
    () =>
      Array.from({ length: PIECES }, (_, i) => ({
        left: (i * 97) % 100,
        delay: ((i * 37) % 100) / 100,
        drift: ((i * 53) % 60) - 30,
        size: 5 + ((i * 13) % 5),
        spin: ((i * 71) % 2 === 0 ? 1 : -1) * (180 + ((i * 29) % 360)),
      })),
    [],
  );

  return (
    <div aria-hidden className="absolute inset-0">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="confetti-piece"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 1.6,
            background: accent,
            opacity: 0.85,
            animationDelay: `${p.delay}s`,
            animationDuration: `${DURATION_MS}ms`,
            ["--confetti-drift" as string]: `${p.drift}px`,
            ["--confetti-spin" as string]: `${p.spin}deg`,
          }}
        />
      ))}
    </div>
  );
}
