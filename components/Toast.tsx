"use client";

import { useEffect } from "react";

const VISIBLE_MS = 4000;

/**
 * A short confirmation at the bottom of the screen. Announced politely rather
 * than as an alert, disappears on its own, and never takes the pointer — it
 * confirms something that happened, it does not ask for anything.
 */
export default function Toast({
  message,
  onDone,
}: {
  message: string | null;
  onDone: () => void;
}) {
  useEffect(() => {
    if (message === null) return;
    const timer = setTimeout(onDone, VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [message, onDone]);

  if (message === null) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4"
    >
      <p className="rounded-lg border border-accent/50 bg-surface/95 px-3 py-2 text-xs shadow-2xl">
        {message}
      </p>
    </div>
  );
}
