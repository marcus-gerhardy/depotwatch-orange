/** @vitest-environment jsdom */
// Preset management (§3.4). Two things are worth a test here: that a user
// preset can be renamed, duplicated and deleted without touching anything
// else, and that a shared JSON file is either taken in whole or refused with a
// reason — a half-applied preset would silently import somebody's file wrong.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useAppStore } from "@/lib/store";
import { emptyPortfolio } from "@/lib/types";
import { I18nProvider } from "@/lib/i18n";
import de from "@/lib/i18n/de";
import { toPresetFile } from "@/lib/importPresetFile";
import type { UserImportPreset } from "@/lib/importPresets";
import ImportPresetsView from "./ImportPresetsView";

const preset: UserImportPreset = {
  id: "p1",
  name: "Mein Export",
  provider: "Acme",
  formatVersion: "2",
  delimiter: ",",
  decimalSeparator: ".",
  encoding: "utf-8",
  mapping: { type: "Type", date: "Time", time: "Time", amountBtc: "Amount" },
  headerSignature: ["Type", "Time", "Amount"],
};

function load(presets: UserImportPreset[] = [preset]) {
  const p = emptyPortfolio();
  p.importPresets = presets;
  useAppStore.setState({ portfolio: p, dirty: false });
}

const view = () =>
  render(
    <I18nProvider locale="de">
      <ImportPresetsView />
    </I18nProvider>,
  );

beforeEach(() => {
  localStorage.clear();
  load();
});
afterEach(cleanup);

const presets = () => useAppStore.getState().portfolio!.importPresets;

describe("user presets", () => {
  it("lists them with provider and format version", () => {
    view();
    expect(screen.getByText("Mein Export")).toBeTruthy();
    expect(screen.getByText(/Acme/)).toBeTruthy();
    expect(screen.getByText(/v2/)).toBeTruthy();
  });

  it("renames one without changing its configuration", () => {
    view();
    fireEvent.click(screen.getByText(de.presets.rename));
    fireEvent.change(screen.getByDisplayValue("Mein Export"), {
      target: { value: "Acme Handel" },
    });
    fireEvent.click(screen.getByText(de.common.save));
    expect(presets()).toHaveLength(1);
    expect(presets()[0].name).toBe("Acme Handel");
    expect(presets()[0].mapping).toEqual(preset.mapping);
  });

  it("duplicates one as a separate preset, leaving the original alone", () => {
    view();
    fireEvent.click(screen.getByText(de.presets.duplicate));
    expect(presets()).toHaveLength(2);
    expect(presets()[0].name).toBe("Mein Export");
    expect(presets()[1].id).not.toBe("p1");
    expect(presets()[1].name).toContain("Mein Export");
  });
});

describe("taking a preset in from JSON", () => {
  function chooseFile(content: string) {
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([content], "preset.json", { type: "application/json" });
    fireEvent.change(input, { target: { files: [file] } });
  }

  it("adds a valid file as a user preset", async () => {
    view();
    const { file } = toPresetFile(preset, {
      id: "acme-v3",
      name: "Acme v3",
      provider: "Acme",
      formatVersion: "3",
      headerSignature: ["Type", "Time", "Amount"],
    });
    chooseFile(JSON.stringify(file));

    await waitFor(() => expect(presets()).toHaveLength(2));
    const added = presets().find((p) => p.id === "acme-v3")!;
    expect(added.name).toBe("Acme v3");
    expect(added.mapping).toEqual(preset.mapping);
    expect(added.headerSignature).toEqual(["Type", "Time", "Amount"]);
  });

  it("refuses a file that is not a preset, and says why", async () => {
    view();
    chooseFile(JSON.stringify({ schemaVersion: 1, name: "Kaputt" }));

    await waitFor(() => expect(screen.getByText(de.presets.importFailed)).toBeTruthy());
    // Nothing half-applied.
    expect(presets()).toHaveLength(1);
  });

  it("refuses a file carrying personal data", async () => {
    view();
    const { file } = toPresetFile(preset, {
      id: "acme-v3",
      name: "Acme v3",
      provider: "Acme",
      formatVersion: "3",
      headerSignature: ["Type", "Time", "Amount"],
    });
    chooseFile(
      JSON.stringify({
        ...file,
        headerSignature: [...file.headerSignature, "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq"],
      }),
    );

    await waitFor(() => expect(screen.getByText(de.presets.importFailed)).toBeTruthy());
    expect(presets()).toHaveLength(1);
  });
});
