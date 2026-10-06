"use client";

// How current the spot price is, and the way to make it current.
//
// Split from the price widget so that only this line re-renders every second:
// the age is the one thing on the dashboard that has to tick that often.

import { useI18n, intlLocale, formatDateTime } from "@/lib/i18n";
import { useNowSeconds } from "@/lib/clock";
import { canRefreshNow, refreshPricesNow, usePriceFeed } from "@/lib/priceFeed";
import { isPriceStale, type PriceDirection } from "@/lib/priceRefresh";
import { useOnline } from "@/lib/serviceWorker";
import { RefreshIcon, WarnIcon, OfflineIcon } from "../icons";

/** "vor 12 Sekunden", "vor 3 Minuten", or a date once it is days old. */
export function formatPriceAge(ageMs: number, at: number, loc: string): string {
  const s = Math.max(0, Math.round(ageMs / 1000));
  const rtf = new Intl.RelativeTimeFormat(loc, { numeric: "auto" });
  if (s < 60) return rtf.format(-s, "second");
  if (s < 3600) return rtf.format(-Math.floor(s / 60), "minute");
  if (s < 86_400) return rtf.format(-Math.floor(s / 3600), "hour");
  return formatDateTime(at, loc);
}

export function PriceStatus({ source }: { source: string }) {
  const { t, locale } = useI18n();
  const loc = intlLocale(locale);
  const feed = usePriceFeed();
  const online = useOnline();
  const now = useNowSeconds();

  // Prerender, or nothing read yet: the source alone, no clock.
  const age = now === 0 || feed.at === null ? null : now - feed.at;
  const stale = age !== null && isPriceStale(age, feed.intervalMs);
  // What explains a price that is not fresh, in order of what the user can
  // do about it: no connection, a source asking for a pause, a failed request.
  const reason = !online
    ? t("price.offline")
    : feed.failure === "rateLimit"
      ? t("price.rateLimited")
      : feed.failure !== null
        ? t("price.failed")
        : stale
          ? t("price.stale")
          : feed.remembered
            ? t("price.remembered")
            : null;
  // Louder once it matters: a reading that has missed a few refreshes is no
  // longer the market's price, whatever the reason.
  const warn = stale || (feed.failure !== null && feed.prices !== null);
  const refreshable = online && now !== 0 && canRefreshNow(feed, now);

  return (
    <div className="flex min-h-5 items-center gap-1.5 text-xs">
      <span
        className={`flex min-w-0 items-center gap-1 ${warn ? "font-medium text-warning" : "text-muted"}`}
      >
        {!online ? <OfflineIcon /> : warn ? <WarnIcon /> : null}
        <span className="truncate">
          {age === null || feed.at === null ? (
            source
          ) : (
            <>
              {reason ? `${reason} · ` : `${source} · `}
              <time dateTime={new Date(feed.at).toISOString()} title={formatDateTime(feed.at, loc)}>
                {t("price.asOf", { age: formatPriceAge(age, feed.at, loc) })}
              </time>
            </>
          )}
        </span>
      </span>
      <button
        type="button"
        onClick={refreshPricesNow}
        disabled={!refreshable}
        aria-busy={feed.fetching}
        aria-label={feed.fetching ? t("price.refreshing") : t("price.refresh")}
        title={
          feed.failure === "rateLimit" && !refreshable
            ? t("price.rateLimitedWait")
            : feed.fetching
              ? t("price.refreshing")
              : t("price.refresh")
        }
        className="ml-auto shrink-0 rounded p-1 text-muted transition-colors hover:text-foreground focus-visible:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
      >
        <RefreshIcon />
      </button>
    </div>
  );
}

/**
 * A price figure that lights up once when it changes, with an arrow that
 * stays until the next change. The arrow's slot is always there, so a change
 * never shifts the figure; the flash is `motion-safe:` only.
 */
export function PriceFlash({
  children,
  direction,
  seq,
  className = "",
}: {
  children: React.ReactNode;
  direction: PriceDirection | null;
  seq: number;
  className?: string;
}) {
  const { t } = useI18n();
  const flash =
    seq === 0 || direction === null
      ? ""
      : direction === "up"
        ? "motion-safe:animate-[price-flash-up_1s_ease-out]"
        : "motion-safe:animate-[price-flash-down_1s_ease-out]";
  return (
    <span className="inline-flex min-w-0 items-baseline gap-1">
      {/* Keyed on the change counter: a new span restarts the animation. */}
      <span key={seq} className={`truncate rounded px-0.5 ${flash} ${className}`}>
        {children}
      </span>
      <span
        className={`w-3 shrink-0 text-[0.65rem] ${
          direction === "up" ? "text-gain" : direction === "down" ? "text-loss" : ""
        }`}
        title={direction ? t(direction === "up" ? "price.up" : "price.down") : undefined}
      >
        {direction === null ? null : (
          <>
            <span aria-hidden>{direction === "up" ? "▲" : "▼"}</span>
            <span className="sr-only">{t(direction === "up" ? "price.up" : "price.down")}</span>
          </>
        )}
      </span>
    </span>
  );
}
