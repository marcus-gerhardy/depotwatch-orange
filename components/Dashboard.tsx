"use client";

// Configurable widget dashboard.
//
// The dashboard itself knows no widget by name: it manages placements (which
// widget sits where, in grid units) and renders whatever the registry in
// components/widgets/registry.ts offers. Adding a widget is one registry entry.
//
// The layout lives in the portfolio file (`uiSettings.dashboardLayout`,
// CLAUDE.md §3.5). It is buffered in component state while editing and written
// back exactly once, when the user leaves edit mode or navigates away — so an
// editing session costs one save instead of one per drag frame, and an
// encrypted file is re-encrypted once instead of continuously.

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import HelpButton from "./help/HelpButton";
import { useI18n } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { formatBtc } from "@/lib/decimal";
import {
  DASHBOARD_COLS,
  DASHBOARD_MARGIN,
  DASHBOARD_ROW_HEIGHT,
  dashboardFor,
  defaultDashboard,
  freeRects,
  layoutBottom,
  nextInstanceId,
  placeAt,
  type WidgetPlacement,
} from "@/lib/dashboardLayout";
import { Button, SectionTitle } from "./ui";
import {
  DashboardDataProvider,
  useDashboardData,
  type TxJumpFilter,
} from "./widgets/context";
import { WIDGET_IDS, type WidgetDefinition } from "./widgets/registry";
import WidgetHost from "./widgets/WidgetHost";
import WidgetPicker from "./widgets/WidgetPicker";
import YearInReviewHint from "./YearInReviewHint";
import BackupReminder from "./BackupReminder";

// The grid measures the DOM and drives drag/resize, so there is nothing to
// prerender — and the static export must not try.
const DashboardGrid = dynamic(() => import("./DashboardGrid"), { ssr: false });

/** Two layouts are the same when every widget sits in the same place. */
function sameLayout(a: WidgetPlacement[], b: WidgetPlacement[]): boolean {
  return (
    a.length === b.length &&
    a.every((p, i) => {
      const q = b[i];
      return (
        p.i === q.i &&
        p.widgetId === q.widgetId &&
        p.x === q.x &&
        p.y === q.y &&
        p.w === q.w &&
        p.h === q.h
      );
    })
  );
}

/** Below this width the dashboard drops to a single column and edit mode is off. */
const WIDE_BREAKPOINT = 768;

function useIsWideViewport(): boolean {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(`(min-width: ${WIDE_BREAKPOINT}px)`);
    const apply = () => setWide(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return wide;
}

/** Portfolio-level warnings; they belong to the whole ledger, not to a widget. */
function LedgerWarnings() {
  const { t, loc, balanceBtc, breakdown, fifo } = useDashboardData();
  const uncoveredBtc = fifo.openLotsBtc.minus(balanceBtc);

  return (
    <>
      {balanceBtc.lt(0) && (
        <p className="rounded-lg border border-loss/40 bg-loss/5 p-3 text-xs text-loss">
          ⚠ {t("dashboard.negativeBalanceHint")}
        </p>
      )}
      {breakdown.invalid.length > 0 && (
        <p className="rounded-lg border border-loss/40 bg-loss/5 p-3 text-xs text-loss">
          ⚠ {t("dashboard.invalidAmountHint", { count: breakdown.invalid.length })}
        </p>
      )}
      {uncoveredBtc.gt("0.00000001") && (
        <p className="rounded-lg border border-warning/40 bg-warning/5 p-3 text-xs text-warning">
          ⚠ {t("dashboard.uncoveredHint", { amount: formatBtc(uncoveredBtc, loc) })}
        </p>
      )}
    </>
  );
}

/** Single-column fallback for narrow viewports (and for the prerendered HTML). */
function WidgetStack({ widgets }: { widgets: WidgetPlacement[] }) {
  const ordered = [...widgets].sort((a, b) => a.y - b.y || a.x - b.x);
  return (
    <div className="space-y-3">
      {ordered.map((w) => (
        <div
          key={w.i}
          // Keep the proportions the user configured: a tile's grid height
          // still decides how tall it is, so charts stay charts.
          style={{ height: w.h * DASHBOARD_ROW_HEIGHT + (w.h - 1) * DASHBOARD_MARGIN[1] }}
        >
          <WidgetHost placement={w} editing={false} onRemove={() => {}} />
        </div>
      ))}
    </div>
  );
}

function DashboardBody({ openBackups }: { openBackups: () => void }) {
  const { t } = useI18n();
  const wide = useIsWideViewport();
  const storedLayout = useAppStore((s) => s.portfolio?.uiSettings?.dashboardLayout);
  const saveDashboardLayout = useAppStore((s) => s.saveDashboardLayout);

  // The file's layout seeds the state; from there the state is the working
  // copy until it is committed back (see commit below).
  const [widgets, setWidgets] = useState<WidgetPlacement[]>(() =>
    dashboardFor({ dashboardLayout: storedLayout }, WIDGET_IDS),
  );
  const [editing, setEditing] = useState(false);
  /** Cell the picker will place into; null while the picker is closed. */
  const [pickerCell, setPickerCell] = useState<{ x: number; y: number } | null>(null);

  // What the session started from. Committing is compared against this rather
  // than against the file: a file written before uiSettings existed renders the
  // default layout, and merely looking at it must not write that default back.
  const baseline = useRef(widgets);
  // The committer is kept in an effect, not written during render: the unmount
  // cleanup below needs the last state, and a ref may only be touched outside
  // rendering.
  const commitRef = useRef<() => void>(() => {});
  useEffect(() => {
    commitRef.current = () => {
      if (sameLayout(widgets, baseline.current)) return;
      baseline.current = widgets;
      saveDashboardLayout(widgets);
    };
  }, [widgets, saveDashboardLayout]);
  // Leaving the dashboard (tab switch, closing the file) also ends the editing
  // session, so the working copy is committed there as well.
  useEffect(() => () => commitRef.current(), []);

  function toggleEditing() {
    if (editing) commitRef.current(); // one write per editing session
    setEditing(!editing);
  }

  const removeWidget = useCallback(
    (instanceId: string) =>
      setWidgets((prev) => prev.filter((w) => w.i !== instanceId)),
    [],
  );

  function addWidget(def: WidgetDefinition, cell: { x: number; y: number }) {
    setWidgets((prev) => [
      ...prev,
      {
        i: nextInstanceId(prev, def.id),
        widgetId: def.id,
        ...placeAt(cell, def.defaultSize, DASHBOARD_COLS),
      },
    ]);
    setPickerCell(null);
  }

  /** "Add widget" from the header: first gap that fits, else below everything. */
  function openPickerAtFirstGap() {
    const gap = freeRects(widgets).find((r) => r.w >= 3 && r.h >= 3);
    setPickerCell(gap ? { x: gap.x, y: gap.y } : { x: 0, y: layoutBottom(widgets) });
  }

  function resetLayout() {
    if (!confirm(t("dashboard.widgets.resetConfirm"))) return;
    setWidgets(defaultDashboard());
  }

  return (
    <div className="space-y-4">
      {/* The view's own heading: every other view has one, and a page whose
          outline starts at a card heading reads as a fragment to a screen
          reader. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <SectionTitle level={1}>{t("nav.dashboard")}</SectionTitle>
          <HelpButton anchor="dash-overview" label={t("nav.dashboard")} className="mb-3" />
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
        {editing && (
          <>
            <Button onClick={openPickerAtFirstGap}>
              + {t("dashboard.widgets.addWidget")}
            </Button>
            <Button variant="danger" onClick={resetLayout}>
              {t("dashboard.widgets.resetLayout")}
            </Button>
          </>
        )}
        {wide && (
          <Button
            variant={editing ? "primary" : "default"}
            onClick={toggleEditing}
            title={t("dashboard.widgets.editHint")}
          >
            {editing ? `✓ ${t("dashboard.widgets.doneEditing")}` : `⚙ ${t("common.edit")}`}
          </Button>
        )}
        </div>
      </div>

      <BackupReminder onOpen={openBackups} />
      <YearInReviewHint />
      <LedgerWarnings />

      {widgets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-c p-8 text-center text-sm text-muted">
          <p>{t("dashboard.widgets.emptyDashboard")}</p>
          <Button
            className="mt-3"
            variant="primary"
            onClick={() => {
              setEditing(true);
              setPickerCell({ x: 0, y: 0 });
            }}
          >
            + {t("dashboard.widgets.addWidget")}
          </Button>
        </div>
      ) : wide ? (
        <DashboardGrid
          widgets={widgets}
          editing={editing}
          onLayoutChange={setWidgets}
          onRemove={removeWidget}
          onAddAt={(cell) => setPickerCell(cell)}
        />
      ) : (
        <WidgetStack widgets={widgets} />
      )}

      {pickerCell && (
        <WidgetPicker
          placedIds={new Set(widgets.map((w) => w.widgetId))}
          onClose={() => setPickerCell(null)}
          onPick={(def) => addWidget(def, pickerCell)}
        />
      )}
    </div>
  );
}

export default function Dashboard({
  onOpenTransactions,
  onOpenWatchlist,
  onOpenMilestones,
  onOpenYearInReview,
  onOpenBackups,
}: {
  /** Jump to the transaction table with a filter applied (wallet or issue). */
  onOpenTransactions?: (filter: TxJumpFilter) => void;
  /** Jump to the address watchlist (the security widgets link there). */
  onOpenWatchlist?: (options?: { add?: boolean }) => void;
  /** Jump to the milestones overview. */
  onOpenMilestones?: () => void;
  /** Jump to the year in review, at the year the December hint names. */
  onOpenYearInReview?: (year: number) => void;
  /** Jump to the backups view (the reminder links there). */
  onOpenBackups?: () => void;
}) {
  const noop = useCallback(() => {}, []);
  return (
    <DashboardDataProvider
      openTransactions={onOpenTransactions ?? noop}
      openWatchlist={onOpenWatchlist ?? noop}
      openMilestones={onOpenMilestones ?? noop}
      openYearInReview={onOpenYearInReview ?? noop}
    >
      <DashboardBody openBackups={onOpenBackups ?? noop} />
    </DashboardDataProvider>
  );
}
