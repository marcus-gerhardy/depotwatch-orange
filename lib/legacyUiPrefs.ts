"use client";

// One-way migration path for interface preferences that used to be a device
// setting in localStorage before they moved into the portfolio file
// (`uiSettings`, CLAUDE.md §3.5).
//
// These values are only read, and only when the open file carries no
// preference of its own — so nothing is lost when a user opens a file written
// before `uiSettings` existed. They are never written back and the old keys are
// never deleted: a file with its own settings always wins, and adopting a
// device value must not silently mark the file as changed. The first time the
// user actually adjusts something, the value is written to the file and the
// legacy entry stops mattering.

function readJson(key: string): unknown {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null; // unreadable or storage unavailable (private mode)
  }
}

/** Layout stored as `{ widgets: [...] }`; returns the bare array. */
export function legacyDashboardLayout(): unknown {
  const stored = readJson("depotwatch.dashboard.v1");
  if (typeof stored !== "object" || stored === null) return null;
  return (stored as { widgets?: unknown }).widgets ?? null;
}

/** Visible transaction-table columns, stored as a plain array of keys. */
export function legacyTransactionColumns(): unknown {
  return readJson("depotwatch.txColumns.v6");
}
