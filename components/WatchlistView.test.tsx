/** @vitest-environment jsdom */
// The watchlist can be opened with its add form already unfolded, because a
// dashboard widget with an empty watchlist offers exactly that step.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { useAppStore } from "@/lib/store";
import { emptyPortfolio } from "@/lib/types";
import WatchlistView from "./WatchlistView";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => [] })));
  useAppStore.setState({ portfolio: emptyPortfolio(), privacyMode: false, dirty: false });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("WatchlistView", () => {
  it("keeps the add form closed by default", () => {
    render(<WatchlistView />);
    expect(screen.queryByLabelText("watchlist.addressOrXpub")).toBeNull();
  });

  it("opens it when a widget sent the user here to add an address", () => {
    render(<WatchlistView initialAdd />);
    expect(screen.getByLabelText("watchlist.addressOrXpub")).toBeTruthy();
  });
});
