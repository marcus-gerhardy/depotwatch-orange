"use client";

// Which files this browser opens for viewing by default (CLAUDE.md §6.7).
//
// A device preference, not a property of the portfolio: it says something about
// how *this* machine is used — a file in a synced folder that should not be
// touched from the laptop, an archived year one only ever looks at. Writing it
// into the file would be the one thing read-only mode exists to avoid, and it
// would follow the file onto every other device.
//
// Keyed by file name, because that is all a browser ever tells us about a file:
// there is no path and no id. Two different files with the same name are the
// known limit of that, and the cost of getting it wrong is a portfolio that
// opens read-only until the checkbox is unticked.

const KEY = "depotwatch.readOnlyFiles.v1";

function read(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw === null ? [] : JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((n): n is string => typeof n === "string") : [];
  } catch {
    return []; // unreadable, or storage unavailable (private mode)
  }
}

function write(names: string[]): void {
  if (typeof window === "undefined") return;
  try {
    if (names.length === 0) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(names));
  } catch {
    // Storage full or unavailable: a preference is not worth an error message.
  }
}

/** Should a file of this name open read-only? */
export function opensReadOnly(fileName: string | null | undefined): boolean {
  return !!fileName && read().includes(fileName);
}

/** Remember (or forget) that this file is one to look at, not to work in. */
export function rememberReadOnly(fileName: string, on: boolean): void {
  const names = read().filter((n) => n !== fileName);
  write(on ? [...names, fileName] : names);
}
