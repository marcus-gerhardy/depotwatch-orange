"use client";

// Lightweight i18n: nested dictionaries, dot-path lookup, {param} interpolation.
// German is the default locale (spec §6.3).

import { createContext, useContext, useEffect } from "react";
import de from "./de";
import en from "./en";
import { useAppStore } from "../store";
import type { Locale } from "../types";

const dictionaries = { de, en } as const;

export type TranslateFn = (
  key: string,
  params?: Record<string, string | number>,
) => string;

const I18nContext = createContext<{ locale: Locale; t: TranslateFn }>({
  locale: "de",
  t: (k) => k,
});

function lookup(dict: object, path: string): string | undefined {
  let cur: unknown = dict;
  for (const part of path.split(".")) {
    if (typeof cur !== "object" || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === "string" ? cur : undefined;
}

export function makeTranslator(locale: Locale): TranslateFn {
  return (key, params) => {
    const raw = lookup(dictionaries[locale], key) ?? lookup(dictionaries.de, key) ?? key;
    if (!params) return raw;
    return raw.replace(/\{(\w+)\}/g, (m, name) =>
      params[name] !== undefined ? String(params[name]) : m,
    );
  };
}

export function I18nProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  return (
    <I18nContext.Provider value={{ locale, t: makeTranslator(locale) }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}

/**
 * Interface language outside the I18nProvider — for the start screen, the
 * footer, and the legal pages, which all render without an open portfolio.
 * Hydrates the remembered preference on mount (never during SSR, so the
 * prerendered markup always matches the default locale).
 */
export function useAppLocale(): { locale: Locale; t: TranslateFn } {
  const locale = useAppStore((s) => s.uiLocale);
  const initUiLocale = useAppStore((s) => s.initUiLocale);
  useEffect(() => initUiLocale(), [initUiLocale]);
  // <html lang> is prerendered as "de" — keep it truthful for screen readers
  // and browser translation once the actual language is known.
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return { locale, t: makeTranslator(locale) };
}

/** BCP-47 tag for Intl formatting. */
export function intlLocale(locale: Locale): string {
  return locale === "de" ? "de-DE" : "en-US";
}

// Dates and times are shown the same way everywhere: de-DE ("24.07.2026",
// "14:05") and en-US ("07/24/2026", "02:05 PM"). Always go through these
// helpers — a bare toLocale*String() call picks up the browser's locale
// instead of the app's.

/** Locale date with 2-digit day/month (de: "24.07.2026", en: "07/24/2026"). */
export function formatDate(date: Date | string | number, loc: string): string {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleDateString(loc, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** Locale time as HH:MM. */
export function formatTime(date: Date | string | number, loc: string): string {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" });
}

/** Date and time in one string ("24.07.2026, 14:05"). */
export function formatDateTime(date: Date | string | number, loc: string): string {
  return `${formatDate(date, loc)}, ${formatTime(date, loc)}`;
}
