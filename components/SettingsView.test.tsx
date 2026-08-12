/** @vitest-environment jsdom */
// The settings are a structure, not a scroll: each group shows its own cards
// and nothing else, and something that links into a group opens at it.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useAppStore } from "@/lib/store";
import { I18nProvider } from "@/lib/i18n";
import { emptyPortfolio } from "@/lib/types";
import SettingsView from "./SettingsView";

const view = (node: React.ReactNode) =>
  render(<I18nProvider locale="de">{node}</I18nProvider>);

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({
    portfolio: emptyPortfolio(),
    fileMode: "fallback",
    backupDirStatus: "none",
    backupDirName: null,
  });
});

afterEach(cleanup);

describe("the groups", () => {
  it("opens on the general group and shows only its cards", () => {
    view(<SettingsView />);
    expect(screen.getByLabelText("Sprache")).toBeTruthy();
    // Nothing from the other groups is on screen at the same time.
    expect(screen.queryByText("Zeitplan und Aufbewahrung")).toBeNull();
    expect(screen.queryByText("Explorer-Quelle (On-Chain-Daten)")).toBeNull();
  });

  it("switches groups from the side menu", () => {
    view(<SettingsView />);
    fireEvent.click(screen.getByRole("button", { name: "Sicherheit" }));
    expect(screen.getByText("Automatisch sperren nach")).toBeTruthy();
    expect(screen.queryByLabelText("Sprache")).toBeNull();
  });

  it("opens at the group it was pointed at", () => {
    // The backup reminder links straight into the backups group (§6.5).
    view(<SettingsView initialSection="backups" />);
    expect(screen.getByText("Zeitplan und Aufbewahrung")).toBeTruthy();
  });

  it("marks the open group for assistive technology", () => {
    view(<SettingsView initialSection="import" />);
    const current = screen
      .getAllByRole("button")
      .filter((b) => b.getAttribute("aria-current") === "page");
    expect(current).toHaveLength(1);
    expect(current[0].textContent).toBe("Import");
  });
});
