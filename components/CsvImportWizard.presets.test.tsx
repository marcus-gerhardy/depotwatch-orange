/** @vitest-environment jsdom */
// Presets in the wizard (§3.4): what a saved preset records, and whether the
// next file of the same shape is recognised by it. The recognition is the
// point of the header signature — a preset that has to be picked by hand is
// only half a preset.

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useAppStore } from "@/lib/store";
import { emptyPortfolio } from "@/lib/types";
import { I18nProvider } from "@/lib/i18n";
import de from "@/lib/i18n/de";
import type { UserImportPreset } from "@/lib/importPresets";
import CsvImportWizard from "./CsvImportWizard";

const CSV = [
  "type,date,amount,price",
  "buy,2024-01-05,0.5,40000",
  "sell,2024-02-06,0.25,60000",
].join("\n");

function open(presets: UserImportPreset[] = []) {
  const p = emptyPortfolio();
  p.wallets = [
    {
      id: "w1",
      name: "Exchange",
      type: "exchange",
      accounts: [{ id: "a1", name: "Spot", transactions: [] }],
    },
  ];
  p.importPresets = presets;
  useAppStore.setState({ portfolio: p, dirty: false });
  return render(
    <I18nProvider locale="de">
      <CsvImportWizard onClose={() => {}} />
    </I18nProvider>,
  );
}

async function chooseFile(container: HTMLElement) {
  fireEvent.change(container.querySelector('input[type="file"]')!, {
    target: { files: [new File([CSV], "exchange.csv", { type: "text/csv" })] },
  });
  await waitFor(() => expect(screen.getByText(/exchange\.csv/)).toBeTruthy());
}

const next = () => fireEvent.click(screen.getByText(`${de.wizard.next} →`));

afterEach(cleanup);

describe("saving a preset in the wizard", () => {
  it("records the header row of the file it worked on", async () => {
    const { container } = open();
    await chooseFile(container);
    next(); // file → filter
    next(); // filter → mapping
    next(); // mapping → type values
    next(); // type values → preview
    next(); // preview → confirm

    fireEvent.change(screen.getByLabelText(de.csvImport.presetSaveAsName), {
      target: { value: "Mein Export" },
    });
    fireEvent.click(screen.getByText(de.csvImport.presetSaveAs));

    const saved = useAppStore.getState().portfolio!.importPresets;
    expect(saved).toHaveLength(1);
    expect(saved[0].headerSignature).toEqual(["type", "date", "amount", "price"]);
    expect(saved[0].createdAt).toBeTruthy();
    expect(saved[0].mapping.amountBtc).toBe("amount");
  });
});

describe("recognising a file", () => {
  const preset: UserImportPreset = {
    id: "p1",
    name: "Acme",
    provider: "Acme",
    formatVersion: "1",
    delimiter: ",",
    decimalSeparator: ".",
    encoding: "utf-8",
    // Deliberately different from the file's spelling: recognition ignores
    // case and spacing, because a header row is written by hand somewhere.
    headerSignature: ["Type", " DATE ", "Amount", "Price"],
    mapping: { type: "type", date: "date", time: "date", amountBtc: "amount" },
  };

  it("applies a preset whose signature fits, however the headers are spelled", async () => {
    const { container } = open([preset]);
    await chooseFile(container);

    await waitFor(() =>
      expect(
        screen.getByText(de.csvImport.presetApplied.replace("{name}", "Acme")),
      ).toBeTruthy(),
    );
  });

  it("offers every fitting preset, newest format version first", async () => {
    const { container } = open([
      preset,
      { ...preset, id: "p2", name: "Acme neu", formatVersion: "2" },
    ]);
    await chooseFile(container);

    await waitFor(() =>
      expect(
        screen.getByText(de.csvImport.presetApplied.replace("{name}", "Acme neu")),
      ).toBeTruthy(),
    );
    const candidates = screen.getAllByRole("button", { pressed: false });
    expect(candidates.some((b) => b.textContent?.includes("Acme (v1)"))).toBe(true);
  });

  it("leaves a file alone that only shares some columns", async () => {
    const { container } = open([
      { ...preset, headerSignature: ["type", "date", "amount", "price", "ledger id"] },
    ]);
    await chooseFile(container);

    expect(screen.queryByText(/automatisch angewendet/)).toBeNull();
  });
});
