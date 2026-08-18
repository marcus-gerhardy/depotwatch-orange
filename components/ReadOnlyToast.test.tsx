/** @vitest-environment jsdom */
// The notice a refused change leaves behind (CLAUDE.md §6.7).
//
// It exists for the writes that get past a disabled control — a keyboard
// shortcut, a dialog that was already open when the mode went on. An app that
// swallows those clicks silently looks broken rather than locked.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { useAppStore } from "@/lib/store";
import ReadOnlyToast from "./ReadOnlyToast";

beforeEach(() => useAppStore.setState({ readOnly: true, readOnlyBlockedAt: null }));
afterEach(cleanup);

describe("the read-only notice", () => {
  it("says nothing until something was actually refused", () => {
    render(<ReadOnlyToast />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("names the refusal and offers the way out of it", () => {
    render(<ReadOnlyToast />);
    act(() => useAppStore.setState({ readOnlyBlockedAt: Date.now() }));

    expect(screen.getByRole("status").textContent).toContain("readOnly.blocked");
    expect(screen.getByRole("button", { name: "readOnly.disable" })).toBeTruthy();
  });

  it("comes back for the next refusal, not only the first", () => {
    // The store reports *when*, not *whether*: a dismissed notice must not
    // swallow the refusal after it.
    render(<ReadOnlyToast />);
    act(() => useAppStore.setState({ readOnlyBlockedAt: 1000 }));
    act(() => useAppStore.setState({ readOnlyBlockedAt: 2000 }));
    expect(screen.getByRole("status")).toBeTruthy();
  });
});
