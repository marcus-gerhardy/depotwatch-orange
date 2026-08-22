/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useAppStore } from "@/lib/store";
import { emptyPortfolio } from "@/lib/types";
import { BASE_POINTS, COLS, START_WIDTH } from "@/lib/blockStacker";
import { resetBestCache } from "@/lib/blockStackerBest";
import de from "@/lib/i18n/de";
import BlockStacker from "./BlockStacker";
import NotFound from "@/app/not-found";

// jsdom has no 2d context and no ResizeObserver, so the canvas paint and the
// measuring both bail out early — which is fine: everything this component
// promises in words is in the DOM, and that is what is checked here.
//
// Asserted against the real German dictionary rather than against keys: the
// game sits outside the app shell and therefore outside the I18nProvider, and
// a version of it that reached for `useI18n` there rendered "arcade.startHint"
// on the page while every key-based test stayed green.

/**
 * rAF under the test's control: nothing runs until it is pumped, and a
 * cancelled frame really is gone — which is the behaviour half of these tests
 * are about.
 */
let frames = new Map<number, FrameRequestCallback>();
let nextFrameId = 0;

/** Run every frame currently queued, and report how many that was. */
function pumpFrames(): number {
  const due = [...frames];
  frames.clear();
  for (const [, cb] of due) cb(0);
  return due.length;
}

beforeEach(() => {
  localStorage.clear();
  resetBestCache();
  frames = new Map();
  nextFrameId = 0;
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    frames.set(++nextFrameId, cb);
    return nextFrameId;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  useAppStore.setState({ portfolio: null });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/**
 * The play area, found by the one phrase all four of its labels share: what a
 * press does right now *is* its accessible name, so it changes between start,
 * drop, paused and game over.
 */
const playArea = () => screen.getByRole("button", { name: /Leertaste/ });
const hint = () => playArea().getAttribute("aria-label");
/** The figure printed next to a label in the score list. */
const figure = (label: string) =>
  screen.getByText(label).nextElementSibling?.textContent;

describe("Block Stacker", () => {
  it("does nothing at all until it is pressed", () => {
    render(<BlockStacker />);
    // No loop, no work: the whole point of a game that sits on a 404 page.
    expect(frames.size).toBe(0);
    expect(hint()).toBe(de.arcade.startHint);
  });

  it("starts on the first press without dropping anything", () => {
    render(<BlockStacker />);
    fireEvent.click(playArea());
    expect(frames.size).toBeGreaterThan(0);
    expect(hint()).toBe(de.arcade.dropHint);
    // Still an empty tower: the press that starts the row must not also place
    // it, or the game would begin by playing itself.
    expect(figure(de.arcade.height)).toBe("0");
  });

  it("places a row on the next press and pays the level's rate", () => {
    render(<BlockStacker />);
    fireEvent.click(playArea()); // start
    fireEvent.click(playArea()); // drop
    expect(figure(de.arcade.height)).toBe("1");
    // Nothing below the first row, so it lands whole.
    expect(figure(de.arcade.score)).toBe(String(START_WIDTH * BASE_POINTS));
  });

  it("is operated with the keyboard, focus and all", () => {
    render(<BlockStacker />);
    const area = playArea();
    area.focus();
    expect(document.activeElement).toBe(area);
    // A real button is what makes space and enter work without a key handler
    // of its own, which is why the play area is one.
    expect(area.tagName).toBe("BUTTON");
    expect(area.getAttribute("type")).toBe("button");
  });

  it("pauses when the tab goes into the background, and says so", () => {
    render(<BlockStacker />);
    fireEvent.click(playArea()); // start
    fireEvent.click(playArea()); // one row, so this is a game in progress

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    fireEvent(document, new Event("visibilitychange"));
    expect(hint()).toBe(de.arcade.paused);

    // The loop is torn down, not merely ignored: nothing is left queued, so
    // no frame can carry the game on behind the user's back.
    expect(pumpFrames()).toBe(0);

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
    fireEvent.click(playArea());
    expect(hint()).toBe(de.arcade.dropHint);
    // Carrying on does not cost the row that was in the air.
    expect(figure(de.arcade.height)).toBe("1");
  });

  it("shows the personal best this browser remembers", () => {
    localStorage.setItem(
      "depotwatch.blockStacker.v1",
      JSON.stringify({ score: 1234, height: 9 }),
    );
    render(<BlockStacker />);
    expect(figure(de.arcade.best)).toBe("1.234");
  });

  it("never marks the portfolio as changed", () => {
    // A game is not portfolio data (§5.1): the file must come out of a round
    // exactly as it went in, or a 404 page would leave something to save.
    const portfolio = emptyPortfolio();
    useAppStore.setState({ portfolio, dirty: false });
    render(<BlockStacker />);
    fireEvent.click(playArea());
    fireEvent.click(playArea());
    expect(useAppStore.getState().dirty).toBe(false);
    // The very same object, not merely an equal one: nothing was written.
    expect(useAppStore.getState().portfolio).toBe(portfolio);
  });

  it("starts with a row that fits the grid", () => {
    expect(START_WIDTH).toBeLessThan(COLS);
  });
});

describe("the 404 page", () => {
  it("keeps the message and both links, with the game folded away", () => {
    render(<NotFound />);
    expect(screen.getByText(de.notFound.title)).toBeTruthy();
    expect(screen.getByRole("link", { name: de.notFound.home })).toBeTruthy();
    expect(screen.getByRole("link", { name: de.help.title })).toBeTruthy();
    expect(screen.queryByText(de.arcade.startHint)).toBeNull();
  });

  it("opens the game on request and folds it away again", async () => {
    render(<NotFound />);
    fireEvent.click(screen.getByRole("button", { name: de.arcade.show }));
    expect(await screen.findByText(de.arcade.intro)).toBeTruthy();
    // The error message is still there: the game is Beiwerk, not a takeover.
    expect(screen.getByText(de.notFound.title)).toBeTruthy();
    expect(screen.getByRole("link", { name: de.notFound.home })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: de.arcade.hide }));
    expect(screen.queryByText(de.arcade.intro)).toBeNull();
  });

  it("is not even offered when the playful touches are off", () => {
    const portfolio = emptyPortfolio();
    portfolio.settings = { ...portfolio.settings, easterEggs: false };
    useAppStore.setState({ portfolio });
    render(<NotFound />);
    expect(screen.queryByRole("button", { name: de.arcade.show })).toBeNull();
    expect(screen.getByText(de.notFound.title)).toBeTruthy();
  });
});
