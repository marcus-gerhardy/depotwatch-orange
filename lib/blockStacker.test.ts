import { describe, expect, it } from "vitest";
import {
  BASE_POINTS,
  COLS,
  HALVING_EVERY,
  MIN_INTERVAL_MS,
  START_INTERVAL_MS,
  START_WIDTH,
  advance,
  createGame,
  drop,
  pointsPerBlock,
  stepIntervalMs,
  type GameState,
} from "./blockStacker";

/** A game with the moving row placed exactly where a test needs it. */
function at(current: { x: number; width: number }, below?: { x: number; width: number }): GameState {
  return {
    ...createGame(),
    stack: below ? [below] : [],
    current,
  };
}

/**
 * A run of perfect drops: the moving row is put straight over the one below
 * before each drop, so the width never shrinks and the game can be taken past
 * as many halvings as a test needs.
 */
function perfectRun(levels: number) {
  let state = createGame();
  const halvings: { level: number; rate: number }[] = [];
  for (let i = 0; i < levels; i++) {
    const below = state.stack[state.stack.length - 1] ?? state.current;
    const result = drop({ ...state, current: { ...below } });
    state = result.state;
    if (result.halved !== null) {
      halvings.push({ level: state.stack.length, rate: result.halved });
    }
  }
  return { state, halvings };
}

describe("the moving row", () => {
  it("turns around at both walls instead of leaving the grid", () => {
    let state: GameState = { ...at({ x: COLS - START_WIDTH, width: START_WIDTH }), dir: 1 };
    state = advance(state);
    expect(state.dir).toBe(-1);
    expect(state.current.x).toBe(COLS - START_WIDTH - 1);

    state = { ...at({ x: 0, width: START_WIDTH }), dir: -1 };
    state = advance(state);
    expect(state.dir).toBe(1);
    expect(state.current.x).toBe(1);
  });

  it("never moves outside the grid, however long it runs", () => {
    let state = createGame();
    for (let i = 0; i < 200; i++) {
      state = advance(state);
      expect(state.current.x).toBeGreaterThanOrEqual(0);
      expect(state.current.x + state.current.width).toBeLessThanOrEqual(COLS);
    }
  });

  it("stands still, as the same object, when it fills the grid", () => {
    // Identity, not just equality: React skips the render, and the paint loop
    // is driven by the state changing.
    const state = at({ x: 0, width: COLS });
    expect(advance(state)).toBe(state);
  });

  it("stands still once the game is over", () => {
    const state = { ...createGame(), over: true };
    expect(advance(state)).toBe(state);
  });
});

describe("dropping a row", () => {
  it("keeps the first row whole: there is nothing below it to miss", () => {
    const { state, lost } = drop(at({ x: 2, width: START_WIDTH }));
    expect(state.stack).toEqual([{ x: 2, width: START_WIDTH }]);
    expect(lost).toEqual([]);
  });

  it("keeps a perfect hit at full width", () => {
    const { state, lost } = drop(at({ x: 2, width: 3 }, { x: 2, width: 3 }));
    expect(state.stack[1]).toEqual({ x: 2, width: 3 });
    expect(lost).toEqual([]);
  });

  it("narrows the row by what hung over the edge, and names those blocks", () => {
    const { state, lost } = drop(at({ x: 3, width: 3 }, { x: 1, width: 3 }));
    // Overlap of [3,6) and [1,4) is [3,4).
    expect(state.stack[1]).toEqual({ x: 3, width: 1 });
    expect(lost).toEqual([{ x: 4, width: 2 }]);
  });

  it("can lose blocks on both sides of a narrower row below", () => {
    const { lost } = drop(at({ x: 1, width: 5 }, { x: 2, width: 2 }));
    expect(lost).toEqual([
      { x: 1, width: 1 },
      { x: 4, width: 2 },
    ]);
  });

  it("ends the game on a complete miss, without recording the level", () => {
    const before = at({ x: 4, width: 2 }, { x: 0, width: 2 });
    const { state, lost } = drop(before);
    expect(state.over).toBe(true);
    // A level that kept nothing was not reached, so the tower does not grow.
    expect(state.stack).toEqual(before.stack);
    expect(state.score).toBe(0);
    expect(lost).toEqual([before.current]);
  });

  it("does nothing at all once the game is over", () => {
    const over = { ...createGame(), over: true };
    expect(drop(over)).toEqual({ state: over, lost: [], halved: null });
  });

  it("starts the next row on the far side, so tapping twice is no free hit", () => {
    // Placed against the left wall: the next row comes in from the right.
    const left = drop(at({ x: 0, width: 3 }, { x: 0, width: 3 })).state;
    expect(left.current.x + left.current.width).toBe(COLS);
    expect(left.dir).toBe(-1);

    const right = drop(at({ x: COLS - 3, width: 3 }, { x: COLS - 3, width: 3 })).state;
    expect(right.current.x).toBe(0);
    expect(right.dir).toBe(1);
  });
});

describe("the reward", () => {
  it("pays per surviving block at the rate of the level being placed", () => {
    const { state } = drop(at({ x: 2, width: 3 }, { x: 2, width: 3 }));
    expect(state.score).toBe(3 * BASE_POINTS);
  });

  it("halves every 21 levels and never falls to nothing", () => {
    expect(pointsPerBlock(0)).toBe(BASE_POINTS);
    expect(pointsPerBlock(HALVING_EVERY - 1)).toBe(BASE_POINTS);
    expect(pointsPerBlock(HALVING_EVERY)).toBe(BASE_POINTS / 2);
    expect(pointsPerBlock(HALVING_EVERY * 2)).toBe(BASE_POINTS / 4);
    // A game that pays nothing for the next hour of play is not a game.
    expect(pointsPerBlock(HALVING_EVERY * 50)).toBe(1);
  });

  it("announces each halving once, on the level that begins the new era", () => {
    // And with the rate the *next* block earns, not the one just left behind:
    // a hint naming the era that has ended would be worse than none.
    expect(perfectRun(HALVING_EVERY * 2 + 5).halvings).toEqual([
      { level: HALVING_EVERY, rate: BASE_POINTS / 2 },
      { level: HALVING_EVERY * 2, rate: BASE_POINTS / 4 },
    ]);
  });

  it("pays the new rate from the level the halving was announced on", () => {
    const before = perfectRun(HALVING_EVERY);
    const after = perfectRun(HALVING_EVERY + 1);
    expect(after.state.score - before.state.score).toBe(
      START_WIDTH * (BASE_POINTS / 2),
    );
  });
});

describe("the speed", () => {
  it("increases with every level but stops at a playable floor", () => {
    expect(stepIntervalMs(0)).toBe(START_INTERVAL_MS);
    expect(stepIntervalMs(1)).toBeLessThan(stepIntervalMs(0));
    expect(stepIntervalMs(10_000)).toBe(MIN_INTERVAL_MS);
    for (let level = 0; level < 500; level++) {
      expect(stepIntervalMs(level)).toBeGreaterThanOrEqual(MIN_INTERVAL_MS);
    }
  });
});
