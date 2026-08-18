"use client";

// The quiet half of external-change detection (CLAUDE.md §6.8).
//
// The save already refuses to overwrite a file that moved — that is the part
// that protects the data. This is the part that protects the user's time: it
// looks every couple of minutes, so "somebody else wrote this file" is
// something one learns before spending an hour editing, rather than at the
// moment of saving.
//
// Deliberately quiet, and deliberately not a dialog: being interrupted mid-edit
// by a modal about a file that has not been written yet would be worse than the
// problem. It sets a flag; the header shows a line; the dialog appears only
// when a write would actually overwrite something.
//
// An interval that compares, not a timer that fires — the same reasoning as the
// auto-lock (§6.4): a throttled background tab gives the right answer on its
// first tick back either way.

import { useEffect } from "react";
import { useAppStore } from "@/lib/store";

/** Long on purpose: a sync client's write is not a thing to poll for. */
const CHECK_INTERVAL_MS = 120_000;

export default function FileWatch() {
  const check = useAppStore((s) => s.checkFileChanged);
  const hasHandle = useAppStore((s) => s.fileHandle !== null);

  useEffect(() => {
    if (!hasHandle) return;
    const timer = setInterval(() => void check(), CHECK_INTERVAL_MS);
    // A tab coming back to the foreground is the moment it is most likely to
    // have missed something — that is when a laptop was closed and synced.
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [check, hasHandle]);

  return null;
}
