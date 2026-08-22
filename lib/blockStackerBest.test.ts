/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from "vitest";
import {
  bestSnapshot,
  readBest,
  resetBestCache,
  saveBest,
  subscribeBest,
} from "./blockStackerBest";

beforeEach(() => {
  localStorage.clear();
  resetBestCache();
});

describe("the personal best", () => {
  it("starts at nothing and comes back as it was written", () => {
    expect(readBest()).toEqual({ score: 0, height: 0 });
    saveBest({ score: 640, height: 12 });
    expect(readBest()).toEqual({ score: 640, height: 12 });
  });

  it("keeps the better run and reports whether the record moved", () => {
    saveBest({ score: 640, height: 12 });
    expect(saveBest({ score: 320, height: 40 })).toEqual({
      best: { score: 640, height: 12 },
      improved: false,
    });
    // The height of the *better* run, not a best-of that never happened.
    expect(readBest()).toEqual({ score: 640, height: 12 });
    expect(saveBest({ score: 641, height: 13 })).toEqual({
      best: { score: 641, height: 13 },
      improved: true,
    });
  });

  it("survives a corrupted or half-written entry", () => {
    localStorage.setItem("depotwatch.blockStacker.v1", "not json");
    expect(readBest()).toEqual({ score: 0, height: 0 });
    localStorage.setItem("depotwatch.blockStacker.v1", '{"score":"lots"}');
    expect(readBest()).toEqual({ score: 0, height: 0 });
  });

  it("hands out the same object until the record actually moves", () => {
    // It backs a `useSyncExternalStore`, so a fresh object per call would
    // re-render for ever.
    expect(bestSnapshot()).toBe(bestSnapshot());
    const before = bestSnapshot();
    saveBest({ score: 1, height: 1 });
    expect(bestSnapshot()).not.toBe(before);
    const after = bestSnapshot();
    saveBest({ score: 1, height: 99 }); // not better, so nothing moves
    expect(bestSnapshot()).toBe(after);
  });

  it("tells its subscribers when the record moved, and only then", () => {
    let calls = 0;
    const stop = subscribeBest(() => calls++);
    saveBest({ score: 10, height: 2 });
    expect(calls).toBe(1);
    saveBest({ score: 5, height: 2 });
    expect(calls).toBe(1);
    stop();
    saveBest({ score: 20, height: 3 });
    expect(calls).toBe(1);
  });

  it("lives under its own key and nowhere near a portfolio", () => {
    // The point of the module: a high score must never end up in the file, or
    // playing would leave a portfolio to save (§5.1).
    saveBest({ score: 5, height: 1 });
    expect(Object.keys(localStorage)).toEqual(["depotwatch.blockStacker.v1"]);
  });
});
