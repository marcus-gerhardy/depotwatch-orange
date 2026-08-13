"use client";

// The turn-of-the-year note on the dashboard that a review is ready (§4.2).
//
// A review only exists for a year that is over, so this points at the year
// that has just ended and appears once it has: through the first quarter, the
// season in which "last year" is still a thing one looks back at. After that
// the review stays one click away on the milestones page and in its own widget,
// without a banner asking for attention.
//
// Deliberately small and deliberately mortal: one line, one link, one dismiss.
// Waving it away is remembered **in the portfolio file**, per year
// (`uiSettings.yearInReviewDismissed`), so it stays gone on every device the
// file is opened on and comes back for the next year, which is a different
// year and a different review.

import { useDashboardData } from "./widgets/context";
import { useI18n } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { useNowDate } from "@/lib/clock";
import { latestReviewYear } from "@/lib/yearInReview";
import { CloseIcon } from "./icons";

/** Months the note is shown in: January to March, the "last year" season. */
const HINT_MONTHS = 3;

export default function YearInReviewHint() {
  const { t } = useI18n();
  const { entries, openYearInReview } = useDashboardData();
  const now = useNowDate();
  const dismissed = useAppStore(
    (s) => s.portfolio?.uiSettings?.yearInReviewDismissed,
  );
  const dismiss = useAppStore((s) => s.dismissYearInReview);

  // No clock during the prerender, and no hint either (lib/clock.ts).
  if (now === null || now.getMonth() >= HINT_MONTHS) return null;
  // Only the year that has just ended, and only when it has something in it.
  const year = latestReviewYear(entries, now);
  if (year === null || year !== now.getFullYear() - 1) return null;
  if ((dismissed ?? []).includes(year)) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-accent/30 bg-accent/5 p-3 text-xs">
      <span>{t("yearInReview.hint.body", { year })}</span>
      <button
        type="button"
        onClick={() => openYearInReview(year)}
        className="text-accent underline decoration-dotted"
      >
        {t("yearInReview.hint.open", { year })}
      </button>
      <button
        type="button"
        onClick={() => dismiss(year)}
        className="ml-auto rounded-md px-1 text-muted hover:text-foreground"
        aria-label={t("yearInReview.hint.dismiss")}
        title={t("yearInReview.hint.dismiss")}
      >
        <CloseIcon />
      </button>
    </div>
  );
}
