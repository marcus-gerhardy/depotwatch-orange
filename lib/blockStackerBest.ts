"use client";

// The personal best of the 404 page's little game (CLAUDE.md §5.1).
//
// In localStorage, deliberately **not** in the portfolio file. Two reasons,
// and the second is the important one: a high score is not portfolio data and
// has no business travelling to another device with somebody's holdings, and
// writing it would mark the file as changed — so playing a game would leave a
// file to save, and in File System Access mode it would quietly be written to
// disk. The 404 page usually has no file open at all.

const KEY = "depotwatch.blockStacker.v1";

export interface BestScore {
  score: number;
  height: number;
}

/** Shared object so `getSnapshot` keeps returning the same reference. */
const NONE: BestScore = { score: 0, height: 0 };

// The record is exposed as an external store rather than copied into state on
// mount: it lives in the browser, so there is no value for it during a
// prerender, and reading localStorage while rendering would make the component
// non-idempotent. Same reasoning as lib/clock.ts.
const listeners = new Set<() => void>();
let snapshot: BestScore | null = null;

export function readBest(): BestScore {
  if (typeof window === "undefined") return NONE;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return NONE;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return NONE;
    const { score, height } = parsed as Partial<BestScore>;
    return {
      score: Number.isFinite(score) ? Math.max(0, Math.floor(score as number)) : 0,
      height: Number.isFinite(height) ? Math.max(0, Math.floor(height as number)) : 0,
    };
  } catch {
    return NONE; // unreadable, or storage unavailable (private mode)
  }
}

export function subscribeBest(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

/**
 * The record, cached so the reference stays stable between renders — an
 * external store that handed back a fresh object every time would re-render
 * forever.
 */
export function bestSnapshot(): BestScore {
  if (snapshot === null) snapshot = readBest();
  return snapshot;
}

/** No record during a prerender: the browser is where it lives. */
export function serverBestSnapshot(): BestScore {
  return NONE;
}

/**
 * Keep the run if it beat the record, and say whether it did.
 *
 * The score decides; the height comes along with it rather than being tracked
 * separately, so the two figures always describe the same run instead of a
 * best-of that never happened.
 */
export function saveBest(run: BestScore): { best: BestScore; improved: boolean } {
  const previous = bestSnapshot();
  if (run.score <= previous.score) return { best: previous, improved: false };
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(KEY, JSON.stringify(run));
    } catch {
      // Storage full or unavailable: a high score is not worth an error.
    }
  }
  snapshot = run;
  for (const listener of listeners) listener();
  return { best: run, improved: true };
}

/** Forget the cached snapshot. For tests, which swap localStorage under it. */
export function resetBestCache(): void {
  snapshot = null;
}
