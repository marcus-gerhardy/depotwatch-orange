/** @vitest-environment jsdom */
// The cover sheet of a printed report: the one page somebody files or hands
// on, so it has to say on its own what this is, what it covers, which file it
// came out of and when (CLAUDE.md §5.4).

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { I18nProvider } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import PrintCover, { type CoverFigure } from "./PrintCover";

afterEach(cleanup);

const cover = (figures: CoverFigure[] = [{ label: "Bestand", value: "1,00000000 BTC" }]) =>
  render(
    <I18nProvider locale="de">
      <PrintCover title="Steuerbericht" subtitle="2025" figures={figures} />
    </I18nProvider>,
  );

describe("PrintCover", () => {
  it("exists on paper only", () => {
    const { container } = cover();
    const section = container.querySelector("section")!;
    // On screen the same figures *are* the view; a second copy above it would
    // be noise, so the whole sheet is print-only.
    expect(section.className).toContain("hidden");
    expect(section.className).toContain("print:block");
    // And nothing of the report may share the cover's sheet.
    expect(section.className).toContain("print:break-after-page");
  });

  it("names the report, what it covers and its figures", () => {
    cover([
      { label: "Bestand", value: "1,00000000 BTC" },
      { label: "Anschaffungskosten", value: "35.546,61 €", note: "ohne einen Lot ohne Einstand" },
    ]);
    expect(screen.getByRole("heading", { name: "Steuerbericht" })).toBeTruthy();
    expect(screen.getByText("2025")).toBeTruthy();
    expect(screen.getByText("Anschaffungskosten")).toBeTruthy();
    expect(screen.getByText("35.546,61 €")).toBeTruthy();
    // A figure may carry what it excludes; a cover that states a number
    // without its caveat is the sheet that gets quoted back at you.
    expect(screen.getByText("ohne einen Lot ohne Einstand")).toBeTruthy();
  });

  it("says which file it was printed from", () => {
    useAppStore.setState({ fileName: "Testportfolio.dwp" });
    cover();
    expect(screen.getByText("Testportfolio.dwp")).toBeTruthy();
    // Two printouts of the same year may legitimately differ once a missing
    // lot assignment is filled in, so the provenance is part of the page.
    expect(screen.getByText(/Erstellt am/)).toBeTruthy();
    expect(screen.getByText(/ersetzt keine Steuerberatung/)).toBeTruthy();
  });

  it("leaves the file line out when nothing is open", () => {
    useAppStore.setState({ fileName: null });
    cover();
    expect(screen.queryByText(/Aus der Datei/)).toBeNull();
  });
});
