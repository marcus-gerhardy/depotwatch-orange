/** @vitest-environment jsdom */
// The waiting room for milestone events raised without a file (§5.2).
//
// The whitepaper is read from a page one visits *before* opening a portfolio,
// so the click had nowhere to go and the milestone was unreachable in practice.
// What matters about the queue is what it promises: the event keeps the time it
// happened, it is remembered once, and it does not haunt a file opened days
// later.

import { beforeEach, describe, expect, it } from "vitest";
import {
  PENDING_TTL_MS,
  addPending,
  clearPendingMilestones,
  freshPending,
  parsePending,
  pendingMilestones,
  queuePendingMilestone,
} from "./milestoneEvents";

const T0 = new Date("2026-08-18T09:00:00.000Z");

beforeEach(() => localStorage.clear());

describe("the pending queue", () => {
  it("keeps the first time an event happened, not the last", () => {
    // Opening the whitepaper twice is one milestone, reached the first time.
    const once = addPending([], "whitepaperOpened", T0);
    const twice = addPending(once, "whitepaperOpened", new Date("2026-08-18T11:00:00.000Z"));

    expect(twice).toHaveLength(1);
    expect(twice[0].at).toBe(T0.toISOString());
  });

  it("drops what is older than a day, and keeps the rest oldest first", () => {
    const now = new Date(T0.getTime() + PENDING_TTL_MS);
    const list = [
      { id: "stale", at: T0.toISOString() },
      { id: "fresh", at: new Date(T0.getTime() + PENDING_TTL_MS - 1000).toISOString() },
      { id: "older", at: new Date(T0.getTime() + 1000).toISOString() },
    ];

    // A click from last week must not attach itself to a file opened today.
    expect(freshPending(list, now).map((e) => e.id)).toEqual(["older", "fresh"]);
  });

  it("survives whatever is in storage", () => {
    expect(parsePending(null)).toEqual([]);
    expect(parsePending("nonsense")).toEqual([]);
    expect(
      parsePending([
        { id: "ok", at: T0.toISOString() },
        { id: "", at: T0.toISOString() },
        { id: "no-date" },
        { id: "bad-date", at: "yesterday" },
        "junk",
        { id: "ok", at: T0.toISOString() }, // a duplicate is still one event
      ]),
    ).toEqual([{ id: "ok", at: T0.toISOString() }]);
  });
});

describe("storage", () => {
  it("remembers an event across reloads and forgets it once applied", () => {
    queuePendingMilestone("whitepaperOpened", T0);

    expect(pendingMilestones(T0).map((e) => e.id)).toEqual(["whitepaperOpened"]);

    clearPendingMilestones();
    expect(pendingMilestones(T0)).toEqual([]);
  });

  it("expires entries on the way out, so nothing has to sweep them", () => {
    queuePendingMilestone("whitepaperOpened", T0);
    const later = new Date(T0.getTime() + PENDING_TTL_MS + 1);

    expect(pendingMilestones(later)).toEqual([]);
    // …and the entry is gone from storage, not merely filtered on read.
    expect(pendingMilestones(T0)).toEqual([]);
  });
});
