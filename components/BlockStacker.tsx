"use client";

// Block Stacker: the small arcade game hidden on the 404 page (CLAUDE.md §5.1).
//
// It is Beiwerk and behaves like it. Nothing here runs until somebody opens it
// and presses once: no loop, no animation, no work at all while the page is
// only being read. The loop stops again when the tab goes into the background
// or the game is over, so a forgotten 404 tab costs nothing.
//
// The rules live in lib/blockStacker.ts, pure and DOM-free; this file is the
// canvas, the input and the clock. Every colour comes from the theme tokens
// (lib/appearance) rather than from a literal, because a canvas cannot read
// CSS variables and a hard-wired orange would be wrong in eight of the nine
// themes.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useAppLocale, intlLocale } from "@/lib/i18n";
import { useThemeColors } from "@/lib/appearance";
import {
  COLS,
  VISIBLE_ROWS,
  advance,
  createGame,
  drop,
  pointsPerBlock,
  stepIntervalMs,
  type GameState,
  type Row,
} from "@/lib/blockStacker";
import {
  bestSnapshot,
  saveBest,
  serverBestSnapshot,
  subscribeBest,
} from "@/lib/blockStackerBest";

/** Largest a cell gets; below that the grid shrinks with its container. */
const MAX_CELL_PX = 34;
/** How long a block that missed keeps falling before it is forgotten. */
const FALL_MS = 620;
/** How long the halving line stays up. */
const HALVING_MS = 2200;

/** A block that missed, on its way out of the picture. */
interface FallingBlock extends Row {
  /** Grid row it fell from, counted from the top of the visible area. */
  row: number;
  bornAt: number;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export default function BlockStacker() {
  // `useAppLocale`, not `useI18n`: this lives on the 404 page, outside the
  // app shell and therefore outside the I18nProvider, where `useI18n` hands
  // back the key itself. That is invisible in a unit test and reads as
  // "arcade.startHint" on the page.
  const { t, locale } = useAppLocale();
  const colors = useThemeColors();
  const loc = intlLocale(locale);
  const fmt = useMemo(() => new Intl.NumberFormat(loc), [loc]);

  const [game, setGame] = useState<GameState>(createGame);
  const [running, setRunning] = useState(false);
  // The record is a device preference (§5.1), so it only exists in the
  // browser: an external store rather than state seeded from localStorage.
  const best = useSyncExternalStore(subscribeBest, bestSnapshot, serverBestSnapshot);
  const [improved, setImproved] = useState(false);
  const [halving, setHalving] = useState<number | null>(null);
  /** Cell size in CSS pixels, measured from the container. */
  const [cell, setCell] = useState(MAX_CELL_PX);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const falling = useRef<FallingBlock[]>([]);
  // The loop and the press handler read the state through a ref: making them
  // depend on it would tear down and rebuild the animation frame several times
  // a second. Written in an effect, never during render.
  const gameRef = useRef(game);
  useEffect(() => {
    gameRef.current = game;
  }, [game]);

  const reduced = useMemo(() => prefersReducedMotion(), []);

  // ------------------------------------------------------------------ size
  useEffect(() => {
    const box = boxRef.current;
    if (!box || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const width = box.clientWidth;
      if (width > 0) setCell(Math.max(12, Math.min(MAX_CELL_PX, width / COLS)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  // ------------------------------------------------------------------ input
  const press = useCallback(() => {
    if (gameRef.current.over) {
      falling.current = [];
      gameRef.current = createGame();
      setGame(gameRef.current);
      setImproved(false);
      setHalving(null);
      setRunning(true);
      return;
    }
    if (!running) {
      setRunning(true);
      return; // the first press starts the row rather than dropping it
    }
    const result = drop(gameRef.current);
    if (!reduced) {
      const now = performance.now();
      // Where the dropped row is on screen: on top of the tower when it stuck,
      // and one row above it when it missed entirely and nothing was placed.
      const placed = !result.state.over;
      const tower = Math.min(
        placed ? result.state.stack.length : gameRef.current.stack.length,
        VISIBLE_ROWS - 1,
      );
      const row = placed ? VISIBLE_ROWS - tower : VISIBLE_ROWS - 1 - tower;
      for (const piece of result.lost) {
        falling.current.push({ ...piece, row, bornAt: now });
      }
    }
    if (result.halved !== null) setHalving(result.halved);
    if (result.state.over) {
      setRunning(false);
      setImproved(
        saveBest({
          score: result.state.score,
          height: result.state.stack.length,
        }).improved,
      );
    }
    gameRef.current = result.state;
    setGame(result.state);
  }, [running, reduced]);

  // ------------------------------------------------------------- the loop
  useEffect(() => {
    if (!running) return;
    let frame = 0;
    let last = performance.now();
    let carry = 0;

    const tick = (now: number) => {
      carry += now - last;
      last = now;
      const interval = stepIntervalMs(gameRef.current.stack.length);
      // Catch-up is capped: a tab that was throttled for a minute must not
      // sprint through half a game the moment it comes back.
      if (carry > interval * 4) carry = interval;
      while (carry >= interval) {
        carry -= interval;
        const next = advance(gameRef.current);
        gameRef.current = next;
        setGame(next);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    // A background tab gets no frames anyway in most browsers, but "most" is
    // not "all" — and stopping deliberately is also what makes the resume
    // above start from a fresh timestamp instead of a minute-long gap.
    const onVisibility = () => {
      if (document.visibilityState === "hidden") setRunning(false);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [running]);

  // The halving line goes away on its own.
  useEffect(() => {
    if (halving === null) return;
    const timer = setTimeout(() => setHalving(null), HALVING_MS);
    return () => clearTimeout(timer);
  }, [halving]);

  // ----------------------------------------------------------------- paint
  const width = COLS * cell;
  const height = VISIBLE_ROWS * cell;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let frame = 0;
    const paint = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== Math.round(width * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      // The playfield is a panel on the page, so it takes the surface colour
      // rather than the page background: on the 404 page the two would be the
      // same and the board would have nothing but its border.
      ctx.fillStyle = colors.surface;
      ctx.fillRect(0, 0, width, height);

      // The grid itself: quiet, but there, so an empty playfield reads as
      // cells to aim at rather than as a black rectangle. Half-pixel offsets
      // keep the hairlines from smearing across two device pixels.
      ctx.globalAlpha = 0.45;
      ctx.strokeStyle = colors.border;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let c = 1; c < COLS; c++) {
        ctx.moveTo(Math.round(c * cell) + 0.5, 0);
        ctx.lineTo(Math.round(c * cell) + 0.5, height);
      }
      for (let r = 1; r < VISIBLE_ROWS; r++) {
        ctx.moveTo(0, Math.round(r * cell) + 0.5);
        ctx.lineTo(width, Math.round(r * cell) + 0.5);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;

      const block = (x: number, row: number, w: number, fill: string, alpha = 1) => {
        ctx.globalAlpha = alpha;
        ctx.fillStyle = fill;
        for (let i = 0; i < w; i++) {
          ctx.fillRect(
            (x + i) * cell + 1.5,
            row * cell + 1.5,
            cell - 3,
            cell - 3,
          );
        }
        ctx.globalAlpha = 1;
      };

      // The tower grows upwards from the bottom edge and scrolls once it is
      // taller than the window. One muted tone for all of it (§5.1), fading
      // towards the bottom: the level one is aiming at is the top one, and a
      // tower drawn in `surface2` was so close to the surface behind it that
      // it read as an empty board.
      const shown = game.stack.slice(-(VISIBLE_ROWS - 1));
      shown.forEach((placed, i) => {
        const age = shown.length === 1 ? 1 : i / (shown.length - 1);
        block(placed.x, VISIBLE_ROWS - 1 - i, placed.width, colors.muted, 0.45 + 0.55 * age);
      });

      // The active row in the accent, directly above the tower.
      if (!game.over) {
        block(
          game.current.x,
          VISIBLE_ROWS - 1 - shown.length,
          game.current.width,
          colors.accent,
        );
      }

      // What missed, on its way down. Empty whenever motion is reduced.
      if (falling.current.length > 0) {
        const now = performance.now();
        falling.current = falling.current.filter((f) => now - f.bornAt < FALL_MS);
        for (const f of falling.current) {
          const p = (now - f.bornAt) / FALL_MS;
          ctx.save();
          ctx.translate(0, p * p * height);
          block(f.x, f.row, f.width, colors.muted, 1 - p);
          ctx.restore();
        }
        frame = requestAnimationFrame(paint);
      }
    };

    paint();
    return () => cancelAnimationFrame(frame);
  }, [game, colors, cell, width, height]);

  const level = game.stack.length;
  const rate = pointsPerBlock(level);
  // What one press would do right now. It is the button's accessible name as
  // well as the line under the grid, so the two can never say different
  // things — including "paused", which is a state the player did not choose
  // (a hidden tab stops the loop) and therefore has to be told about.
  const hint = game.over
    ? t("arcade.again")
    : running
      ? t("arcade.dropHint")
      : level > 0
        ? t("arcade.paused")
        : t("arcade.startHint");

  return (
    <div className="space-y-2">
      <div ref={boxRef} className="mx-auto w-full" style={{ maxWidth: COLS * MAX_CELL_PX }}>
        {/* The play area is one button: a single impulse is the whole control
            scheme, so mouse, touch and the space bar all arrive here, and the
            focus ring comes from the global :focus-visible rule (§5). */}
        <button
          type="button"
          onClick={press}
          aria-label={hint}
          className="block rounded-lg border border-border-c bg-surface p-0 leading-none [touch-action:manipulation]"
          style={{ width, height }}
        >
          {/* The canvas is decoration: everything it shows is written out
              below in text, so there is nothing here for a screen reader. */}
          <canvas ref={canvasRef} aria-hidden className="block" style={{ width, height }} />
        </button>
      </div>

      <p className="text-center text-xs text-muted" aria-hidden>
        {hint}
      </p>

      <dl className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs">
        <div className="flex gap-1">
          <dt className="text-muted">{t("arcade.score")}</dt>
          <dd className="font-mono">{fmt.format(game.score)}</dd>
        </div>
        <div className="flex gap-1">
          <dt className="text-muted">{t("arcade.height")}</dt>
          <dd className="font-mono">{fmt.format(level)}</dd>
        </div>
        <div className="flex gap-1">
          <dt className="text-muted">{t("arcade.best")}</dt>
          <dd className="font-mono">{fmt.format(best.score)}</dd>
        </div>
      </dl>

      {/* One line at a time under the grid, so nothing below it moves: the
          halving while it is fresh, then the game's outcome, then the reward
          the next block earns.

          This is also the live region, rather than the score list above it: it
          changes at a halving and at the end of a run, which is exactly what
          is worth saying out loud. Announcing every drop would be a sentence
          per tap. */}
      <p
        className="min-h-8 text-center text-xs leading-4"
        role="status"
        aria-live="polite"
      >
        {halving !== null ? (
          <span className="text-accent motion-safe:animate-[milestone-in_240ms_ease-out] inline-block">
            {t("arcade.halving", { points: fmt.format(halving) })}
          </span>
        ) : game.over ? (
          <span className={improved ? "text-gain" : "text-muted"}>
            {improved
              ? t("arcade.newBest", { score: fmt.format(best.score) })
              : t("arcade.over", {
                  score: fmt.format(game.score),
                  height: fmt.format(level),
                })}
          </span>
        ) : (
          <span className="text-muted">
            {t("arcade.perBlock", { points: fmt.format(rate) })}
          </span>
        )}
      </p>
    </div>
  );
}
