// Block Stacker: the rules of the little arcade game on the 404 page.
//
// Pure and DOM-free on purpose, exactly like the rest of lib/: no canvas, no
// clock of its own (the caller decides when a step happens), no storage. A
// game is a state and three functions over it, which is what makes the awkward
// parts — the bounce at the edges, what a near miss costs, when the reward
// halves — testable without rendering anything.
//
// The game itself: a row of blocks slides back and forth over a grid, one cell
// per step. Dropping it keeps only what overlaps the row below; the rest falls
// away, so every miss makes the row narrower. Miss entirely and there is
// nothing left to stack, which is the end.

/** Columns of the grid. Seven still reads as a grid on a narrow phone. */
export const COLS = 7;
/** Rows of the tower kept on screen; the tower itself is unbounded. */
export const VISIBLE_ROWS = 10;
/** How wide the row starts. Three is the classic, and it forgives one miss. */
export const START_WIDTH = 3;

/**
 * Levels between two halvings, and the reward per block before the first one.
 *
 * The nod is the point, so the interval is 21 rather than a round number. The
 * base is a power of two so every halving is exact — a reward of "12,5 points"
 * would be arithmetically honest about the block subsidy and unreadable as a
 * score. It never reaches zero: after six halvings it stays at one point per
 * block, because a game that pays nothing for the next hour of play is not a
 * game any more.
 */
export const HALVING_EVERY = 21;
export const BASE_POINTS = 64;

/** Milliseconds per cell at level 0, how much each level takes off, and the floor. */
export const START_INTERVAL_MS = 340;
export const INTERVAL_STEP_MS = 8;
export const MIN_INTERVAL_MS = 90;

/** A run of blocks on one level: `width` cells starting at column `x`. */
export interface Row {
  x: number;
  width: number;
}

export interface GameState {
  /** The tower, oldest level first. Its length is the height reached. */
  stack: Row[];
  /** The row currently sliding above it. */
  current: Row;
  dir: 1 | -1;
  score: number;
  over: boolean;
}

/** Points one block is worth at this level. Halves every `HALVING_EVERY`. */
export function pointsPerBlock(level: number): number {
  const halvings = Math.floor(level / HALVING_EVERY);
  return Math.max(1, Math.floor(BASE_POINTS / 2 ** halvings));
}

/** How long one cell of movement takes at this level. */
export function stepIntervalMs(level: number): number {
  return Math.max(MIN_INTERVAL_MS, START_INTERVAL_MS - level * INTERVAL_STEP_MS);
}

export function createGame(): GameState {
  return {
    stack: [],
    current: { x: 0, width: START_WIDTH },
    dir: 1,
    score: 0,
    over: false,
  };
}

/**
 * One step of movement: a cell sideways, turning around at the walls.
 *
 * Returns the state unchanged (identity, so React can skip the render) when
 * there is nothing to move: a finished game, or a row as wide as the grid.
 */
export function advance(state: GameState): GameState {
  const { x, width } = state.current;
  if (state.over || width >= COLS) return state;
  let dir = state.dir;
  let next = x + dir;
  if (next < 0 || next + width > COLS) {
    dir = (dir === 1 ? -1 : 1) as 1 | -1;
    next = x + dir;
  }
  return { ...state, current: { x: next, width }, dir };
}

export interface DropResult {
  state: GameState;
  /** The parts of the dropped row that missed, for the animation. */
  lost: Row[];
  /** Set when this drop crossed a halving: the reward from here on. */
  halved: number | null;
}

/**
 * Drop the moving row onto the tower.
 *
 * What survives is the overlap with the row below; the first row has nothing
 * below it and lands whole. No overlap at all means no blocks are left, which
 * ends the game — and ends it without placing anything, because a level that
 * kept nothing was not reached.
 */
export function drop(state: GameState): DropResult {
  if (state.over) return { state, lost: [], halved: null };

  const cur = state.current;
  const below = state.stack[state.stack.length - 1];
  const left = below ? Math.max(cur.x, below.x) : cur.x;
  const right = below
    ? Math.min(cur.x + cur.width, below.x + below.width)
    : cur.x + cur.width;
  const width = right - left;

  if (width <= 0) {
    return {
      state: { ...state, over: true },
      lost: [cur],
      halved: null,
    };
  }

  const lost: Row[] = [];
  if (left > cur.x) lost.push({ x: cur.x, width: left - cur.x });
  if (right < cur.x + cur.width) {
    lost.push({ x: right, width: cur.x + cur.width - right });
  }

  const level = state.stack.length;
  const stack = [...state.stack, { x: left, width }];
  // The next row starts on the *far* side of what was just placed. Letting it
  // reappear where it landed would hand out a perfect stack to anyone tapping
  // twice quickly, which is the one way this game can be made boring.
  const fromLeft = left + width / 2 >= COLS / 2;

  return {
    state: {
      stack,
      current: { x: fromLeft ? 0 : COLS - width, width },
      dir: fromLeft ? 1 : -1,
      score: state.score + width * pointsPerBlock(level),
      over: false,
    },
    lost,
    // Announced on the level that begins the new era, so the figure shown is
    // the one the next block will actually earn.
    halved:
      stack.length % HALVING_EVERY === 0 ? pointsPerBlock(stack.length) : null,
  };
}
