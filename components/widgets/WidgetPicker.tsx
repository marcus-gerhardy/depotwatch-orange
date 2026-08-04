"use client";

// Picker shown when a free grid cell's "+" is clicked: every registry entry
// with its name, description, preview icon and the data it needs.

import { useI18n } from "@/lib/i18n";
import { Modal } from "../ui";
import { WIDGETS, type WidgetDataSource, type WidgetDefinition } from "./registry";

const SOURCE_LABEL: Record<WidgetDataSource, string> = {
  ledger: "dashboard.widgets.sources.ledger",
  price: "dashboard.widgets.sources.price",
  priceHistory: "dashboard.widgets.sources.priceHistory",
  explorer: "dashboard.widgets.sources.explorer",
};

export default function WidgetPicker({
  onPick,
  onClose,
  /** Widget ids already on the dashboard, marked as such (still selectable). */
  placedIds,
}: {
  onPick: (widget: WidgetDefinition) => void;
  onClose: () => void;
  placedIds: Set<string>;
}) {
  const { t } = useI18n();

  return (
    <Modal title={t("dashboard.widgets.pickerTitle")} onClose={onClose} wide>
      <p className="mb-3 text-xs text-muted">{t("dashboard.widgets.pickerIntro")}</p>
      <ul className="grid max-h-[60vh] grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
        {WIDGETS.map((w) => (
          <li key={w.id}>
            <button
              type="button"
              onClick={() => onPick(w)}
              className="flex w-full gap-3 rounded-lg border border-border-c bg-surface-2 p-3 text-left transition-colors hover:border-accent-dim"
            >
              <span aria-hidden className="text-xl leading-none">
                {w.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{t(w.titleKey)}</span>
                  {placedIds.has(w.id) && (
                    <span className="shrink-0 rounded bg-accent/15 px-1.5 py-0.5 text-[0.6rem] text-accent">
                      {t("dashboard.widgets.alreadyPlaced")}
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-muted">
                  {t(w.descriptionKey)}
                </span>
                <span className="mt-1.5 flex flex-wrap gap-1">
                  {w.dataSources.map((s) => (
                    <span
                      key={s}
                      className="rounded border border-border-c px-1.5 py-0.5 text-[0.6rem] text-muted"
                    >
                      {t(SOURCE_LABEL[s])}
                    </span>
                  ))}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
