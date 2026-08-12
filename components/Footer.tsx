"use client";

// Slim footer shown on every page. Reads the locale directly from the store so
// it also works outside the I18nProvider (e.g. on the legal pages).

import Link from "next/link";
import { useAppLocale } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { isGenesisDay, isRunningBitcoinDay } from "@/lib/easterEggs";
import { staticPagePath } from "@/lib/routes";

const GITHUB_URL = "https://github.com/marcus-gerhardy/depotwatch-orange";

export default function Footer() {
  const { t, locale } = useAppLocale();
  // The switch lives in the portfolio file; without one open, the touches are
  // on, like the default.
  const eggs = useAppStore((s) => s.portfolio?.settings.easterEggs) !== false;
  // Only on the day itself, in the reader's own timezone (§5.1).
  const dayLine = !eggs
    ? null
    : isGenesisDay()
      ? t("footer.genesisHeadline")
      : isRunningBitcoinDay()
        ? t("footer.runningBitcoin")
        : null;

  const linkCls = "hover:text-accent transition-colors";

  return (
    <footer className="border-t border-border-c/60 bg-background">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 text-xs text-muted">
        <div className="flex items-center gap-2">
          <span className="text-accent" aria-hidden>
            ₿
          </span>
          <span>DepotWatch Orange</span>
          <span aria-hidden>·</span>
          <span>{t("footer.openSource")}</span>
          <span className="rounded border border-border-c bg-surface px-1.5 py-0.5 font-mono text-[10px]">
            MIT
          </span>
        </div>
        {dayLine && (
          <p className="order-last w-full text-[11px] text-muted/80 italic sm:order-none sm:w-auto">
            {dayLine}
          </p>
        )}
        <nav className="flex items-center gap-4">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={linkCls}
          >
            {t("footer.github")} ↗
          </a>
          <Link href={staticPagePath("help", locale)} className={linkCls}>
            {t("footer.help")}
          </Link>
          <Link href={staticPagePath("imprint", locale)} className={linkCls}>
            {t("footer.imprint")}
          </Link>
          <Link href={staticPagePath("privacy", locale)} className={linkCls}>
            {t("footer.privacy")}
          </Link>
        </nav>
      </div>
    </footer>
  );
}
