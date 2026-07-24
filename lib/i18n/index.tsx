"use client";

// Lightweight i18n: nested dictionaries, dot-path lookup, {param} interpolation.
// German is the default locale (spec §6.3).

import { createContext, useContext } from "react";
import de from "./de";
import en from "./en";
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

/** BCP-47 tag for Intl formatting. */
export function intlLocale(locale: Locale): string {
  return locale === "de" ? "de-DE" : "en-US";
}

/** Locale date with 2-digit day/month (de: "24.07.2026", en: "07/24/2026"). */
export function formatDate(date: Date | string, loc: string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString(loc, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** Locale time as HH:MM. */
export function formatTime(date: Date | string, loc: string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" });
}
