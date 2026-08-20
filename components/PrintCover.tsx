"use client";

// The cover sheet of a printed report (CLAUDE.md §5.4).
//
// A stack of paper is read differently from a screen: the first sheet has to
// answer, on its own, what this is, what it covers, where it came from and
// what the headline figures are — because that is the sheet somebody keeps,
// files, or hands across a desk, and often the only one they read twice.
// Everything behind it is the evidence for what this page says.
//
// It exists only on paper. On screen the same figures are the view itself, and
// a second copy of them above the first would be noise.

import type { ReactNode } from "react";
import { useI18n, intlLocale, formatDateTime } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { useNowDate } from "@/lib/clock";

export interface CoverFigure {
  label: string;
  value: string;
  /** A second line under the figure — what it excludes, what it rests on. */
  note?: ReactNode;
}

export default function PrintCover({
  title,
  subtitle,
  figures,
}: {
  title: string;
  /** What the report covers: a date, or a period. */
  subtitle: string;
  /** The headline figures, in reading order. */
  figures: CoverFigure[];
}) {
  const { t, locale } = useI18n();
  const loc = intlLocale(locale);
  const fileName = useAppStore((s) => s.fileName);
  const now = useNowDate();

  return (
    <section className="hidden print:block print:break-after-page">
      <div className="border-b border-current/40 pb-3">
        <p className="font-heading text-sm font-bold tracking-wide uppercase">
          {t("app.name")}
        </p>
      </div>

      {/* The title sits a third of the way down, the way a title page does —
          not at the very top, where it would read as a running header. */}
      <div className="pt-24">
        <h1 className="text-3xl font-bold">{title}</h1>
        <p className="mt-1 text-lg">{subtitle}</p>
      </div>

      <dl className="mt-10 grid grid-cols-2 gap-x-10 gap-y-5">
        {figures.map((f) => (
          <div key={f.label} className="border-t border-current/25 pt-2">
            <dt className="text-[10pt]">{f.label}</dt>
            <dd className="mt-0.5 font-mono text-xl font-semibold">{f.value}</dd>
            {f.note && <dd className="mt-0.5 text-[9pt] leading-snug">{f.note}</dd>}
          </div>
        ))}
      </dl>

      {/* At the foot, where the provenance of a document belongs: which file
          this came out of, and when — two printouts of the same year may
          legitimately differ once a missing lot assignment is filled in. */}
      <div className="mt-16 border-t border-current/40 pt-3 text-[9pt] leading-relaxed">
        {fileName && (
          <p>
            {t("print.fromFile")} <span className="font-mono">{fileName}</span>
          </p>
        )}
        <p>{t("print.generated", { time: now ? formatDateTime(now, loc) : "" })}</p>
        <p className="mt-2">{t("print.disclaimer")}</p>
      </div>
    </section>
  );
}
