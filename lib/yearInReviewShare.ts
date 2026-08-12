// What a shared year-in-review image is allowed to say (CLAUDE.md §4.2).
//
// This module exists because the privacy rule of the share export must be
// testable without a canvas. It turns a `YearReview` into the lines the image
// prints, and it is the single place that decides which of them are **absolute
// amounts** — the holding, the sums invested, the sats stacked, the euros
// realised. Those are off unless the user explicitly turns them on, because a
// screenshot that names what somebody owns in bitcoin is a personal security
// problem, not a privacy preference.
//
// Everything else says just as much about the year without saying that: how
// many buys, at what average rate, in what rhythm, what share went into own
// custody, how the holding changed in percent. A relative figure is the same
// story told by somebody who cannot be robbed for it.
//
// Pure and formatter-driven: the caller passes `t` and the locale, so the same
// lines come out in DE and EN and a test can assert on the keys rather than on
// translated strings.

import { formatBtc, formatFiat, formatInt, formatPercent } from "./decimal";
import { satsOf } from "./displayUnit";
import type { YearReview, YearReviewCardId } from "./yearInReview";
import type { TranslateFn } from "./i18n";

/** One line of the image: a label and a figure. */
export interface ShareStat {
  /** Stable id, so tests can talk about lines without translating them. */
  key: string;
  label: string;
  value: string;
  /**
   * The line states an absolute amount — a holding, a sum of money, a sats
   * figure. Only rendered when the user asked for it in so many words.
   */
  absolute: boolean;
}

export interface ShareOptions {
  t: TranslateFn;
  /** Intl locale, e.g. "de-DE". */
  loc: string;
  /** Show absolute amounts. Off by default, and never on by accident. */
  absolute: boolean;
  /** Show BTC amounts as sats, following the display unit (§6.3). */
  sats: boolean;
}

/** Every line the image could print, before the absolute ones are filtered. */
function allStats(review: YearReview, o: ShareOptions): ShareStat[] {
  const { t, loc } = o;
  const out: ShareStat[] = [];
  const push = (key: string, label: string, value: string, absolute = false) =>
    out.push({ key, label, value, absolute });
  const amount = (btc: Parameters<typeof formatBtc>[0]) =>
    o.sats ? `${formatInt(satsOf(btc), loc)} sats` : `${formatBtc(btc, loc)} BTC`;
  const has = (id: YearReviewCardId) => review.cards.includes(id);

  if (has("stacked")) {
    push("buys", t("yearInReview.share.buys"), formatInt(review.stacked.buyCount, loc));
    if (review.stacked.growth !== null) {
      push(
        "growth",
        t("yearInReview.share.growth"),
        formatPercent(review.stacked.growth, loc),
      );
    }
    push("stacked", t("yearInReview.share.stacked"), amount(review.stacked.netBtc), true);
  }
  if (has("invested")) {
    push(
      "invested",
      t("yearInReview.share.invested"),
      formatFiat(review.invested.investedEur, "EUR", loc),
      true,
    );
  }
  if (review.avgPrice) {
    push(
      "avgPrice",
      t("yearInReview.share.avgPrice"),
      formatFiat(review.avgPrice.yourAvgEur, "EUR", loc),
    );
    if (review.avgPrice.vsMarket !== null) {
      push(
        "vsMarket",
        t("yearInReview.share.vsMarket"),
        formatPercent(review.avgPrice.vsMarket, loc),
      );
    }
  }
  if (review.priceRange) {
    push(
      "priceRange",
      t("yearInReview.share.priceRange"),
      `${formatFiat(review.priceRange.lowEur, "EUR", loc)} – ${formatFiat(
        review.priceRange.highEur,
        "EUR",
        loc,
      )}`,
    );
  }
  if (review.rhythm) {
    push(
      "busiestMonth",
      t("yearInReview.share.busiestMonth"),
      new Intl.DateTimeFormat(loc, { month: "long" }).format(
        new Date(review.year, review.rhythm.busiestMonth, 1),
      ),
    );
    push(
      "busiestWeekday",
      t("yearInReview.share.busiestWeekday"),
      // 1970-01-04 was a Sunday, which is index 0 of `getDay`.
      new Intl.DateTimeFormat(loc, { weekday: "long" }).format(
        new Date(Date.UTC(1970, 0, 4 + review.rhythm.busiestWeekday)),
      ),
    );
  }
  if (review.streak) {
    push(
      "streak",
      t(`yearInReview.share.streak.${review.streak.unit}`),
      formatInt(review.streak.length, loc),
    );
  }
  if (has("fees")) {
    if (review.fees.shareOfInvested !== null) {
      push(
        "feeShare",
        t("yearInReview.share.feeShare"),
        formatPercent(review.fees.shareOfInvested, loc).replace("+", ""),
      );
    }
    push(
      "fees",
      t("yearInReview.share.fees"),
      formatFiat(review.fees.totalEur, "EUR", loc),
      true,
    );
  }
  if (has("taxFree")) {
    push("taxFree", t("yearInReview.share.taxFree"), amount(review.taxFree.btc), true);
  }
  if (has("realized")) {
    push(
      "realized",
      t("yearInReview.share.realized"),
      formatFiat(review.realized.totalGainEur, "EUR", loc),
      true,
    );
  }
  if (has("custody")) {
    push(
      "custody",
      t("yearInReview.share.custody"),
      formatPercent(review.custody.shareAtYearEnd, loc).replace("+", ""),
    );
  }
  if (review.milestones.length > 0) {
    push(
      "milestones",
      t("yearInReview.share.milestones"),
      formatInt(review.milestones.length, loc),
    );
  }
  if (has("closing")) {
    push("closing", t("yearInReview.share.closing"), amount(review.closing.btc), true);
  }
  return out;
}

/**
 * The lines the image actually prints. Without `absolute`, every line that
 * states an amount is dropped — not blurred, not abbreviated, dropped: an
 * image is a file that outlives the moment it was posted in.
 */
export function shareStats(review: YearReview, o: ShareOptions): ShareStat[] {
  return allStats(review, o).filter((s) => o.absolute || !s.absolute);
}

/** How many lines the user is holding back — what the switch offers to reveal. */
export function hiddenStatCount(review: YearReview, o: ShareOptions): number {
  return allStats(review, o).filter((s) => s.absolute).length;
}
