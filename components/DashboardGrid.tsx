"use client";

// The draggable/resizable dashboard grid.
//
// Loaded through next/dynamic with ssr:false (see Dashboard.tsx): the layout
// engine measures the DOM, so there is nothing useful it could prerender into
// the static export.

import { useMemo } from "react";
import ReactGridLayout, {
  useContainerWidth,
  type Layout,
} from "react-grid-layout";
import { calcGridCellDimensions } from "react-grid-layout/core";
import { useI18n } from "@/lib/i18n";
import {
  DASHBOARD_COLS,
  DASHBOARD_MARGIN,
  DASHBOARD_PADDING,
  DASHBOARD_ROW_HEIGHT,
  DASHBOARD_SPARE_ROWS,
  freeRects,
  type WidgetPlacement,
} from "@/lib/dashboardLayout";
import { WIDGETS_BY_ID } from "./widgets/registry";
import { WIDGET_DRAG_HANDLE } from "./widgets/WidgetFrame";
import WidgetHost from "./widgets/WidgetHost";

export default function DashboardGrid({
  widgets,
  editing,
  onLayoutChange,
  onRemove,
  onAddAt,
}: {
  widgets: WidgetPlacement[];
  editing: boolean;
  onLayoutChange: (widgets: WidgetPlacement[]) => void;
  onRemove: (instanceId: string) => void;
  /** A free cell was clicked; open the picker for this position. */
  onAddAt: (cell: { x: number; y: number }) => void;
}) {
  const { t } = useI18n();
  const { width, containerRef } = useContainerWidth({ initialWidth: 1152 });

  // Size limits come from the registry, so a widget can never be squeezed to
  // an unreadable size no matter what the stored layout says.
  const layout: Layout = useMemo(
    () =>
      widgets.map((w) => {
        const def = WIDGETS_BY_ID.get(w.widgetId);
        return {
          i: w.i,
          x: w.x,
          y: w.y,
          w: w.w,
          h: w.h,
          minW: def?.minSize.w,
          minH: def?.minSize.h,
          maxW: def?.maxSize?.w,
          maxH: def?.maxSize?.h,
        };
      }),
    [widgets],
  );

  const dims = useMemo(
    () =>
      calcGridCellDimensions({
        width,
        cols: DASHBOARD_COLS,
        rowHeight: DASHBOARD_ROW_HEIGHT,
        margin: DASHBOARD_MARGIN,
        containerPadding: DASHBOARD_PADDING,
      }),
    [width],
  );

  const gaps = useMemo(
    () => (editing ? freeRects(widgets, DASHBOARD_COLS, DASHBOARD_SPARE_ROWS) : []),
    [editing, widgets],
  );

  function handleLayoutChange(next: Layout) {
    const byId = new Map(next.map((l) => [l.i, l]));
    let changed = false;
    const merged = widgets.map((w) => {
      const l = byId.get(w.i);
      if (!l) return w;
      if (l.x === w.x && l.y === w.y && l.w === w.w && l.h === w.h) return w;
      changed = true;
      return { ...w, x: l.x, y: l.y, w: l.w, h: l.h };
    });
    // react-grid-layout also reports the layout it compacted on mount; only
    // pass on real changes, otherwise this bounces between parent and grid.
    if (changed) onLayoutChange(merged);
  }

  const spareHeight = DASHBOARD_SPARE_ROWS * (dims.cellHeight + dims.gapY);

  return (
    <div ref={containerRef}>
      <div
        className="relative"
        style={{ paddingBottom: editing ? spareHeight : undefined }}
      >
        <ReactGridLayout
          className={editing ? "dashboard-grid dashboard-grid-editing" : "dashboard-grid"}
          layout={layout}
          width={width}
          gridConfig={{
            cols: DASHBOARD_COLS,
            rowHeight: DASHBOARD_ROW_HEIGHT,
            margin: DASHBOARD_MARGIN,
            containerPadding: DASHBOARD_PADDING,
          }}
          dragConfig={{ enabled: editing, handle: `.${WIDGET_DRAG_HANDLE}` }}
          resizeConfig={{ enabled: editing, handles: ["se", "e", "s"] }}
          onLayoutChange={handleLayoutChange}
        >
          {widgets.map((w) => (
            <div key={w.i}>
              <WidgetHost placement={w} editing={editing} onRemove={onRemove} />
            </div>
          ))}
        </ReactGridLayout>

        {editing && (
          <div className="pointer-events-none absolute inset-0">
            {gaps.map((rect) => (
              <button
                key={`${rect.x}:${rect.y}`}
                type="button"
                title={t("dashboard.widgets.addHere")}
                aria-label={t("dashboard.widgets.addHere")}
                onClick={() => onAddAt({ x: rect.x, y: rect.y })}
                className="pointer-events-auto absolute flex items-center justify-center rounded-xl border border-dashed border-border-c text-xl text-muted transition-colors hover:border-accent hover:bg-accent/5 hover:text-accent"
                style={{
                  left: dims.offsetX + rect.x * (dims.cellWidth + dims.gapX),
                  top: dims.offsetY + rect.y * (dims.cellHeight + dims.gapY),
                  width: rect.w * dims.cellWidth + (rect.w - 1) * dims.gapX,
                  height: rect.h * dims.cellHeight + (rect.h - 1) * dims.gapY,
                }}
              >
                +
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
