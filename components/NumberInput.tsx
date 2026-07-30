"use client";

// Locale-aware numeric input. The value handed to `onChange` is always a
// canonical decimal string ("1234.5") — that is what the ledger stores and what
// every calculation expects — while the field itself shows the locale's decimal
// separator (de: "1234,5"). Typing is never interrupted: the text is only
// reformatted when the field loses focus, and an entry that is not a number is
// left exactly as typed so validation can flag it.

import { useEffect, useRef, useState } from "react";
import { useI18n, intlLocale } from "@/lib/i18n";
import {
  decimalSeparatorOf,
  formatBtcInput,
  formatFiatInput,
  parseNumberInput,
} from "@/lib/decimal";
import { inputCls } from "./ui";

export default function NumberInput({
  value,
  onChange,
  kind = "btc",
  className = "",
  style,
  placeholder,
  disabled = false,
  ariaLabel,
}: {
  /** Canonical decimal string, or free text the user is still editing. */
  value: string;
  onChange: (canonical: string) => void;
  /** How the value is reformatted on blur: 8 decimals, ≥2, or none. */
  kind?: "btc" | "fiat" | "int";
  className?: string;
  /** For widths that depend on the data (CSV preview columns). */
  style?: React.CSSProperties;
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const { locale } = useI18n();
  const loc = intlLocale(locale);
  const format = (v: string) => {
    if (kind === "int") return v.replace(".", decimalSeparatorOf(loc));
    return kind === "btc" ? formatBtcInput(v, loc) : formatFiatInput(v, loc);
  };

  const display = (canonical: string) => {
    const parsed = parseNumberInput(canonical);
    return parsed === null ? canonical : format(parsed);
  };

  const [text, setText] = useState(() => display(value));
  const ref = useRef<HTMLInputElement>(null);

  // Follow value changes from outside (a derived price, a reset, a preset) —
  // but never while the user is typing in this very field.
  useEffect(() => {
    if (document.activeElement !== ref.current) setText(display(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, loc, kind]);

  return (
    <input
      ref={ref}
      className={`${className || inputCls}`}
      style={style}
      inputMode="decimal"
      placeholder={placeholder}
      disabled={disabled}
      aria-label={ariaLabel}
      value={text}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        const canonical = parseNumberInput(raw);
        // Pass the raw text through when it is not a number, so the parent can
        // show an error instead of silently receiving a stale value.
        onChange(canonical ?? raw);
      }}
      onBlur={() => setText(display(value))}
    />
  );
}

/** The locale's decimal separator, for placeholders like "0,00000000". */
export function decimalPlaceholder(loc: string, places: number): string {
  return `0${decimalSeparatorOf(loc)}${"0".repeat(places)}`;
}
