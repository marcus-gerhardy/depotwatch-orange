"use client";

// The settings without an open file: only what belongs to this device rather
// than to a portfolio — the language and the appearance. Everything else in
// the settings is part of a file and appears once one is open; it is left out
// here rather than shown disabled.

import { useI18n } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import type { Locale } from "@/lib/types";
import { Card, Field, SectionTitle, inputCls } from "../ui";
import AppearanceFields from "./AppearanceFields";

export default function DeviceSettings() {
  const { t, locale } = useI18n();
  const setUiLocale = useAppStore((s) => s.setUiLocale);

  return (
    <div className="max-w-2xl space-y-4">
      <SectionTitle level={1}>{t("settings.title")}</SectionTitle>
      <p className="text-xs text-muted">{t("settings.withoutFile")}</p>
      <Card className="space-y-3">
        <SectionTitle level={2}>{t("settings.general")}</SectionTitle>
        <Field label={t("settings.language")}>
          <select
            className={inputCls}
            value={locale}
            onChange={(e) => setUiLocale(e.target.value as Locale)}
          >
            <option value="de">Deutsch</option>
            <option value="en">English</option>
          </select>
        </Field>
      </Card>
      <Card className="space-y-3">
        <SectionTitle level={2}>{t("settings.appearance")}</SectionTitle>
        <AppearanceFields />
      </Card>
    </div>
  );
}
