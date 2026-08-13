"use client";

import { memo } from "react";
import { useI18n } from "@/lib/i18n";
import type { WidgetPlacement } from "@/lib/dashboardLayout";
import { WIDGETS_BY_ID } from "./registry";
import { WidgetBoundary, WidgetError, WidgetShell } from "./WidgetFrame";

/**
 * One placed widget: the frame, the error boundary, and the registry
 * component. Memoized because react-grid-layout compares children by
 * reference — without it every drag frame would re-render every widget.
 */
function WidgetHost({
  placement,
  editing,
  onRemove,
}: {
  placement: WidgetPlacement;
  editing: boolean;
  onRemove: (instanceId: string) => void;
}) {
  const { t } = useI18n();
  const def = WIDGETS_BY_ID.get(placement.widgetId);
  // A layout entry for an unknown widget is filtered out on load, so this can
  // only happen mid-session — render nothing rather than crash the grid.
  if (!def) return null;
  const Component = def.component;

  return (
    <WidgetShell
      title={t(def.titleKey)}
      widgetId={def.id}
      editing={editing}
      onRemove={() => onRemove(placement.i)}
      removeLabel={t("dashboard.widgets.remove")}
    >
      <WidgetBoundary
        fallback={(reset) => (
          <WidgetError
            message={t("dashboard.widgets.crashed")}
            onRetry={reset}
            retryLabel={t("common.refresh")}
          />
        )}
      >
        <Component />
      </WidgetBoundary>
    </WidgetShell>
  );
}

export default memo(WidgetHost);
