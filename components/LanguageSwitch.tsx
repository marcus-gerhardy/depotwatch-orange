"use client";

// Language switch for the pages that exist without an open portfolio (start
// screen, legal pages, "how it works"). Both languages stay visible so it is
// obvious what is on offer, but the control is kept to two short codes so it
// does not compete with the page content. With a portfolio open it does the
// same as the language setting in the settings view (see store.setUiLocale).

import { useAppLocale } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import type { Locale } from "@/lib/types";

const LOCALES: { id: Locale; name: string }[] = [
  { id: "de", name: "Deutsch" },
  { id: "en", name: "English" },
];

export default function LanguageSwitch({
  className = "",
}: {
  className?: string;
}) {
  const { locale } = useAppLocale();
  const setUiLocale = useAppStore((s) => s.setUiLocale);

  return (
    <div
      className={`inline-flex items-center overflow-hidden rounded-md border border-border-c text-[11px] leading-none ${className}`}
      role="group"
      aria-label="Sprache / Language"
    >
      {LOCALES.map((l, i) => (
        <button
          key={l.id}
          onClick={() => setUiLocale(l.id)}
          title={l.name}
          aria-label={l.name}
          aria-pressed={locale === l.id}
          className={`px-1.5 py-1 font-medium uppercase transition-colors ${
            i > 0 ? "border-l border-border-c" : ""
          } ${
            locale === l.id
              ? "bg-accent/15 text-accent"
              : "text-muted hover:bg-surface-2 hover:text-foreground"
          }`}
        >
          {l.id}
        </button>
      ))}
    </div>
  );
}
