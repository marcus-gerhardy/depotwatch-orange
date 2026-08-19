"use client";

// The letterhead of a printed report (CLAUDE.md §5.4).
//
// On screen this is redundant: the app's own header says which file is open,
// and the view's heading says what one is looking at. On paper none of that
// exists — the chrome is gone, and what is left is a sheet that has to
// identify itself to whoever picks it up, possibly months later and possibly a
// tax adviser. So it names the app, the report, what it covers, the file it
// came out of, and when it was made.
//
// The timestamp matters more than it looks: a portfolio report is a statement
// about a moment, and two printouts of the same year can legitimately differ
// once a missing lot assignment is filled in. A sheet that cannot say when it
// was produced is a sheet nobody can reconcile.

import { useI18n, intlLocale, formatDateTime } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { useNowDate } from "@/lib/clock";

export default function PrintHeader({
  title,
  subtitle,
}: {
  /** What this report is. */
  title: string;
  /** What it covers — a date, or a period. */
  subtitle: string;
}) {
  const { t, locale } = useI18n();
  const loc = intlLocale(locale);
  const fileName = useAppStore((s) => s.fileName);
  const now = useNowDate();

  return (
    <header className="hidden print:mb-4 print:block print:border-b print:border-current/30 print:pb-2">
      <div className="flex items-baseline justify-between gap-4">
        <p className="font-heading text-base font-bold">{t("app.name")}</p>
        <p className="text-[10pt]">
          {t("print.generated", { time: now ? formatDateTime(now, loc) : "" })}
        </p>
      </div>
      <div className="mt-1 flex items-baseline justify-between gap-4">
        <h1 className="text-lg font-bold">{title}</h1>
        <p className="text-[10pt]">{subtitle}</p>
      </div>
      {fileName && <p className="mt-0.5 font-mono text-[9pt]">{fileName}</p>}
    </header>
  );
}
