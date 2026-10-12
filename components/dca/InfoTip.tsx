"use client";

// A short explanation behind an "i": the label stays one or two words, and
// whoever wants the detail asks for it. A button rather than a hover title,
// so it works by keyboard and on touch screens; Escape and a click elsewhere
// close it.

import { useEffect, useId, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { InfoIcon } from "../icons";

export default function InfoTip({ label, text }: { label: string; text: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  return (
    <span ref={ref} className="relative inline-flex align-middle">
      <button
        type="button"
        aria-label={t("dca.info", { what: label })}
        aria-expanded={open}
        aria-controls={id}
        onClick={(e) => {
          // Inside a <label>, a click would otherwise focus the input.
          e.preventDefault();
          setOpen((o) => !o);
        }}
        className="rounded-full text-muted hover:text-accent"
      >
        <InfoIcon />
      </button>
      {open && (
        <span
          id={id}
          role="note"
          className="absolute top-full left-1/2 z-20 mt-1 w-60 -translate-x-1/2 rounded-lg border border-border-c bg-surface-2 p-2.5 text-left text-xs leading-snug font-normal text-foreground shadow-lg"
        >
          {text}
        </span>
      )}
    </span>
  );
}
