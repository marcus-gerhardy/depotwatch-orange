/** @vitest-environment jsdom */
// The help as a surface: opening it from a button next to something, landing on
// the right section, and the keyboard contract a panel owes its user.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useAppStore } from "@/lib/store";
import { I18nProvider } from "@/lib/i18n";
import { emptyPortfolio } from "@/lib/types";
import HelpButton from "./HelpButton";
import HelpPanel from "./HelpPanel";

const view = (node: React.ReactNode) =>
  render(<I18nProvider locale="de">{node}</I18nProvider>);

beforeEach(() => {
  useAppStore.setState({ portfolio: emptyPortfolio(), helpTarget: null });
});

afterEach(cleanup);

describe("opening", () => {
  it("stays closed until something asks for it", () => {
    view(<HelpPanel />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens at the section a help button points at", () => {
    view(
      <>
        <HelpButton anchor="csv-duplicates" label="CSV" />
        <HelpPanel />
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: /CSV/ }));

    expect(screen.getByRole("dialog")).toBeTruthy();
    // The section's own topic is the one on screen, not the first topic.
    expect(screen.getByRole("heading", { name: "CSV-Import" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Duplikate" })).toBeTruthy();
  });

  it("opens at the beginning from the header button", () => {
    view(<HelpPanel />);
    act(() => useAppStore.getState().openHelp(""));
    expect(screen.getByRole("heading", { name: "Erste Schritte" })).toBeTruthy();
  });
});

describe("the keyboard contract", () => {
  it("takes focus, closes on Escape and gives focus back", () => {
    view(
      <>
        <HelpButton anchor="tax-holding" label="Steuer" />
        <HelpPanel />
      </>,
    );
    const opener = screen.getByRole("button", { name: /Steuer/ });
    opener.focus();
    fireEvent.click(opener);

    const panel = screen.getByRole("dialog");
    expect(document.activeElement).toBe(panel);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("does not trap the app behind it", () => {
    // A panel beside your work, not on top of it: the app stays operable, so
    // this is a dialog without aria-modal.
    view(<HelpPanel />);
    act(() => useAppStore.getState().openHelp("tx-types"));
    expect(screen.getByRole("dialog").getAttribute("aria-modal")).toBeNull();
  });
});

describe("searching inside the panel", () => {
  it("finds a section and jumps to it", () => {
    view(<HelpPanel />);
    act(() => useAppStore.getState().openHelp(""));

    fireEvent.change(screen.getByPlaceholderText("Suchen …"), {
      target: { value: "freigrenze" },
    });
    const hit = screen.getByRole("button", { name: /Freigrenze/ });
    fireEvent.click(hit);

    expect(screen.getByRole("heading", { name: "Steuern" })).toBeTruthy();
  });
});
