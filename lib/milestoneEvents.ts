"use client";

// Milestone events that happen while no portfolio file is open (CLAUDE.md §5.2).
//
// Two milestones are things the file could never work out for itself — the
// whitepaper was opened, a tax report was exported — so they are recorded when
// they happen. That works only as long as there *is* a file to record them in,
// and the whitepaper is precisely the case where there usually is not: it is
// reached from "how it works", which is a page one reads before opening
// anything. The milestone was therefore unreachable in practice: every click
// went into a store with no portfolio and was dropped on the floor.
//
// So an event raised without a file waits here, in localStorage, until the next
// file is opened. Deliberately small and deliberately short-lived:
//
//  • one entry per milestone, with **the time it actually happened** — that
//    time becomes `achievedAt`, not the moment the file was opened, because a
//    milestone records when something was done;
//  • entries expire after 24 hours. A click from last month must not attach
//    itself to a file opened today: by then it is somebody's forgotten browser
//    session, not a thing this portfolio's owner just did;
//  • the queue is device state, not portfolio state. It is the waiting room, so
//    it is cleared once its contents have been written into a file.

const KEY = "depotwatch.milestoneEvents.v1";

/** Entries older than this are dropped unapplied. */
export const PENDING_TTL_MS = 24 * 60 * 60 * 1000;

export interface PendingMilestone {
  id: string;
  /** ISO-8601 — when the event happened, which is what gets recorded. */
  at: string;
}

/** Parse whatever is in storage, keeping only entries that are usable. */
export function parsePending(raw: unknown): PendingMilestone[] {
  if (!Array.isArray(raw)) return [];
  const out: PendingMilestone[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const { id, at } = entry as { id?: unknown; at?: unknown };
    if (typeof id !== "string" || id === "") continue;
    if (typeof at !== "string" || Number.isNaN(Date.parse(at))) continue;
    if (!out.some((e) => e.id === id)) out.push({ id, at });
  }
  return out;
}

/** The entries still worth applying, oldest event first. */
export function freshPending(
  list: PendingMilestone[],
  now: Date = new Date(),
): PendingMilestone[] {
  return list
    .filter((e) => now.getTime() - Date.parse(e.at) < PENDING_TTL_MS)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

/**
 * Add an event to the queue. The **first** time wins: opening the whitepaper
 * twice is one milestone, reached the first time.
 */
export function addPending(
  list: PendingMilestone[],
  id: string,
  now: Date = new Date(),
): PendingMilestone[] {
  return list.some((e) => e.id === id)
    ? list
    : [...list, { id, at: now.toISOString() }];
}

function read(): PendingMilestone[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw === null ? [] : parsePending(JSON.parse(raw));
  } catch {
    return []; // unreadable, or storage unavailable (private mode)
  }
}

function write(list: PendingMilestone[]): void {
  if (typeof window === "undefined") return;
  try {
    if (list.length === 0) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Storage full or unavailable: a milestone is not worth an error message.
  }
}

/** Remember an event that had no file to go into. */
export function queuePendingMilestone(id: string, now: Date = new Date()): void {
  write(addPending(read(), id, now));
}

/** What is waiting and still fresh; expired entries are dropped on the way. */
export function pendingMilestones(now: Date = new Date()): PendingMilestone[] {
  const fresh = freshPending(read(), now);
  write(fresh);
  return fresh;
}

/** Applied — the waiting room is empty again. */
export function clearPendingMilestones(): void {
  write([]);
}
