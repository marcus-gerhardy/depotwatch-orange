"use client";

// Small building blocks of the key lab: a labelled value with a copy button,
// and a collapsible derivation step.

import { useEffect, useState } from "react";
import type { TranslateFn } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { Section } from "../ui";

/**
 * One value of the chain: monospace, wrapped anywhere (a 130-digit key has no
 * word breaks), blurred in privacy mode — the page exists to be shown on a
 * screen, and a shared screen is exactly what that mode is for.
 */
export function KeyValue({
  t,
  label,
  value,
}: {
  t: TranslateFn;
  label: string;
  value: string;
}) {
  const privacyMode = useAppStore((s) => s.privacyMode);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(id);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      // No clipboard permission (or no secure context): nothing to report
      // beyond the button not confirming — the value is selectable anyway.
    }
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted">{label}</span>
        <button
          type="button"
          onClick={copy}
          aria-label={t("keyLab.copyLabel", { what: label })}
          className="shrink-0 rounded px-1.5 py-0.5 text-[0.7rem] text-accent hover:bg-surface-2"
        >
          <span aria-live="polite">{copied ? t("keyLab.copied") : t("keyLab.copy")}</span>
        </button>
      </div>
      <code
        className={`block break-all rounded-md bg-surface-2/60 px-2 py-1.5 font-mono text-xs text-foreground ${
          privacyMode ? "privacy-blur" : ""
        }`}
      >
        {value}
      </code>
    </div>
  );
}

/** A derivation step: what happens here, then the values it produces. */
export function Step({
  title,
  body,
  defaultOpen = false,
  children,
}: {
  title: string;
  body: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Section title={title} defaultOpen={defaultOpen}>
      <p className="text-xs leading-relaxed text-muted">{body}</p>
      {children}
    </Section>
  );
}
