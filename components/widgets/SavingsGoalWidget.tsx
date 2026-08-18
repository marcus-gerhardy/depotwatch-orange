"use client";

// The savings target (CLAUDE.md §4.4).
//
// Written under one rule: **it reports, it does not urge.** No "you are
// behind", no streak, no suggestion to buy. Somebody's savings are not a game
// with a scoreboard, and a target the user set themselves is a measure, not a
// promise the app gets to hold them to. Everything here is a statement of
// where things stand — including when that is "past the date and not there",
// which is said as a fact and left at that.
//
// Without a target the widget does not exist: the registry keeps it out of the
// picker and the grid, so an empty tile never has to explain itself.

import { useI18n, intlLocale, formatDate } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { useNowDate } from "@/lib/clock";
import { goalProgress } from "@/lib/savingsGoal";
import { Amount } from "../ui";
import { useDashboardData } from "./context";
import { Meter, StatLabel, StatValue, WidgetEmpty, WidgetSkeleton } from "./WidgetFrame";

export default function SavingsGoalWidget() {
  const { t, locale } = useI18n();
  const loc = intlLocale(locale);
  const { balanceBtc, entries, fmtAmount } = useDashboardData();
  const goal = useAppStore((s) => s.portfolio?.settings.savingsGoal);
  // A widget may not read the clock while rendering (§4.1).
  const now = useNowDate();

  if (!goal) return <WidgetEmpty message={t("goal.none")} />;
  if (!now) return <WidgetSkeleton lines={3} />;

  const p = goalProgress(goal, balanceBtc, entries, now);
  if (!p) return <WidgetEmpty message={t("goal.none")} />;

  return (
    <div className="flex h-full flex-col gap-3">
      <div>
        <StatValue className={p.reached ? "text-gain" : ""}>
          {new Intl.NumberFormat(loc, { style: "percent", maximumFractionDigits: 1 }).format(
            p.fraction,
          )}
        </StatValue>
        <StatLabel>
          {t("goal.of", { target: fmtAmount(p.targetBtc) })}
        </StatLabel>
      </div>

      <Meter value={p.fraction} color={p.reached ? "bg-gain" : "bg-accent"} />

      <dl className="space-y-1 text-xs">
        <div className="flex justify-between gap-2">
          <dt className="text-muted">{t("goal.current")}</dt>
          <dd className="font-mono">
            <Amount>{fmtAmount(p.currentBtc)}</Amount>
          </dd>
        </div>
        {!p.reached && (
          <div className="flex justify-between gap-2">
            <dt className="text-muted">{t("goal.remaining")}</dt>
            <dd className="font-mono">
              <Amount>{fmtAmount(p.remainingBtc)}</Amount>
            </dd>
          </div>
        )}
        {p.byDate?.requiredBtcPerMonth && (
          <div className="flex justify-between gap-2">
            <dt className="text-muted">{t("goal.needed")}</dt>
            <dd className="font-mono">
              <Amount>{fmtAmount(p.byDate.requiredBtcPerMonth)}</Amount>
            </dd>
          </div>
        )}
        {p.paceBtcPerMonth && !p.reached && (
          <div className="flex justify-between gap-2">
            <dt className="text-muted">{t("goal.pace")}</dt>
            <dd className="font-mono">
              <Amount>{fmtAmount(p.paceBtcPerMonth)}</Amount>
            </dd>
          </div>
        )}
      </dl>

      <div className="mt-auto space-y-1 text-xs text-muted">
        {p.reached ? (
          <p className="text-gain">{t("goal.reached")}</p>
        ) : (
          <>
            {/* The projection is what the rate so far would reach — offered as
                arithmetic, not as a forecast anybody should rely on. */}
            {p.projectedDate && (
              <p>{t("goal.projected", { date: formatDate(p.projectedDate, loc) })}</p>
            )}
            {/* Past the date and not there: stated once, plainly, in the
                neutral colour. Nothing is gained by scolding somebody about
                their own savings target. */}
            {p.byDate?.overdue && <p>{t("goal.datePassed", {
              date: formatDate(p.byDate.date, loc),
            })}</p>}
            {p.byDate && !p.byDate.overdue && (
              <p>{t("goal.by", { date: formatDate(p.byDate.date, loc) })}</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
