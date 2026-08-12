"use client";

// The milestones overview (CLAUDE.md §5.2).
//
// Everything the catalogue holds, grouped by category: what has been reached
// with the date it happened, what has not with what it takes. Quantitative
// entries show how far along they are, because "1 000 000 sats" says nothing
// about whether one is nearly there.
//
// Reachable with the playful touches switched off, too. What that switch turns
// off is the interruption, not the record.

import { useMemo } from "react";
import { useI18n, intlLocale, formatDate } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { formatBtc, formatInt, formatPercent } from "@/lib/decimal";
import { computeFifo } from "@/lib/fifo";
import { flattenLedger } from "@/lib/types";
import {
  MILESTONES,
  MILESTONE_CATEGORIES,
  categoryProgress,
  milestoneContext,
  type MilestoneDefinition,
  type MilestoneProgress,
} from "@/lib/milestones";
import MilestoneIcon from "./MilestoneIcon";
import { Card, SectionTitle } from "./ui";
import { Meter } from "./widgets/WidgetFrame";

export default function MilestonesView() {
  const { t, locale } = useI18n();
  const loc = intlLocale(locale);
  const portfolio = useAppStore((s) => s.portfolio)!;
  const encrypted = useAppStore((s) => s.encryptionEnabled);
  const fileName = useAppStore((s) => s.fileName);

  const records = useMemo(() => portfolio.milestones ?? [], [portfolio.milestones]);
  const byId = useMemo(() => new Map(records.map((m) => [m.id, m])), [records]);

  // The same snapshot the evaluation uses, so the progress figures and the
  // achieved marks can never disagree.
  const ctx = useMemo(() => {
    const entries = flattenLedger(portfolio.wallets);
    return milestoneContext(
      portfolio,
      entries,
      computeFifo(entries, portfolio.settings.holdingPeriodDays),
      { encrypted, savedOnce: fileName !== null },
    );
  }, [portfolio, encrypted, fileName]);

  const perCategory = categoryProgress(records);
  const achievedTotal = perCategory.reduce((s, c) => s + c.achieved, 0);
  const total = MILESTONES.length;

  const formatProgress = (p: MilestoneProgress): string => {
    switch (p.unit) {
      case "sats":
        return `${formatInt(Math.floor(p.current), loc)} / ${formatInt(p.target, loc)} sats`;
      case "btc":
        return `${formatBtc(String(p.current / 100_000_000), loc)} / ${formatBtc(
          String(p.target / 100_000_000),
          loc,
        )} BTC`;
      case "percent":
        return `${Math.floor(p.current)} % / ${p.target} %`;
      case "days":
        return t("milestones.daysProgress", {
          current: formatInt(Math.floor(p.current), loc),
          target: formatInt(p.target, loc),
        });
    }
  };

  const row = (def: MilestoneDefinition) => {
    const record = byId.get(def.id);
    const progress = record ? null : def.progress?.(ctx);
    return (
      <li
        key={def.id}
        className={`flex gap-3 border-b border-border-c/40 py-2 last:border-0 ${
          record ? "" : "opacity-60"
        }`}
      >
        {/* Drawn, not an emoji, and the same box whether it is reached or
            not — a column of icons that changed size on being earned would
            make the list jump. What changes is the colour. */}
        <MilestoneIcon
          id={def.id}
          className={`mt-0.5 h-5 w-5 shrink-0 ${record ? "text-accent" : "text-muted"}`}
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {t(`milestones.catalog.${def.id}.title`)}
          </p>
          <p className="text-xs leading-snug text-muted">
            {t(`milestones.catalog.${def.id}.description`)}
          </p>
          {progress && progress.target > 0 && (
            <div className="mt-1 max-w-56">
              <Meter value={progress.current / progress.target} />
              <p className="mt-0.5 font-mono text-[0.65rem] text-muted">
                {formatProgress(progress)}
              </p>
            </div>
          )}
        </div>
        <div className="shrink-0 text-right text-xs whitespace-nowrap">
          {record ? (
            <span className="text-gain">✓ {formatDate(record.achievedAt, loc)}</span>
          ) : (
            <span className="text-muted">{t("milestones.open")}</span>
          )}
        </div>
      </li>
    );
  };

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <SectionTitle level={1}>{t("milestones.title")}</SectionTitle>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">
          {t("milestones.intro")}
        </p>
      </div>

      <Card className="space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm">{t("milestones.overall")}</span>
          <span className="font-mono text-sm">
            {achievedTotal} / {total}
            <span className="ml-2 text-muted">
              {formatPercent(total > 0 ? achievedTotal / total : 0, loc).replace("+", "")}
            </span>
          </span>
        </div>
        <Meter value={total > 0 ? achievedTotal / total : 0} />
      </Card>

      {MILESTONE_CATEGORIES.map((category) => {
        const stats = perCategory.find((c) => c.category === category)!;
        return (
          <Card key={category} className="space-y-2">
            <div className="flex items-baseline justify-between gap-3">
              <SectionTitle level={2}>
                {t(`milestones.categories.${category}`)}
              </SectionTitle>
              <span className="font-mono text-xs text-muted">
                {stats.achieved} / {stats.total}
              </span>
            </div>
            <Meter value={stats.total > 0 ? stats.achieved / stats.total : 0} />
            <ul>
              {MILESTONES.filter((m) => m.category === category).map(row)}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}
