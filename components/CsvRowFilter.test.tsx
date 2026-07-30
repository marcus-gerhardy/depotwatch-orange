/** @vitest-environment jsdom */
import { useState } from "react";
import { describe, expect, it, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { EMPTY_ROW_FILTER, filterRows, type RowFilter } from "@/lib/csvImport";
import CsvRowFilter from "./CsvRowFilter";

const headers = ["transaction_type", "asset", "amount"];
const rows = [
  ["trade", "BTC", "0.5"],
  ["reward", "BTC", "0.01"],
  ["trade", "ETH", "2"],
  ["withdrawal", "BTC", "0.2"],
];

/** The editor is controlled — this mirrors how the wizard drives it. */
function Harness({ onFilter }: { onFilter?: (f: RowFilter) => void }) {
  const [filter, setFilter] = useState<RowFilter>(EMPTY_ROW_FILTER);
  return (
    <>
      <CsvRowFilter
        headers={headers}
        rows={rows}
        filter={filter}
        onChange={(f) => {
          setFilter(f);
          onFilter?.(f);
        }}
      />
      <output data-testid="matched">{filterRows(rows, headers, filter).length}</output>
    </>
  );
}

const addRule = () =>
  fireEvent.click(screen.getByRole("button", { name: "+ csvImport.filterAddRule" }));

const columnSelects = () =>
  screen.getAllByRole("combobox").filter((el) =>
    within(el).queryByRole("option", { name: "transaction_type" }),
  );

afterEach(cleanup);

describe("CsvRowFilter", () => {
  it("starts without conditions and imports every row", () => {
    render(<Harness />);
    expect(screen.getByTestId("matched").textContent).toBe("4");
    expect(screen.queryByLabelText("csvImport.filterRemoveRule")).toBeNull();
  });

  it("offers the distinct values of the chosen column with their counts", () => {
    render(<Harness />);
    addRule();
    fireEvent.change(columnSelects()[0], { target: { value: "transaction_type" } });

    expect(screen.getByLabelText("trade")).toBeTruthy();
    const tradeRow = screen.getByLabelText("trade").closest("label")!;
    expect(tradeRow.textContent).toContain("2");
    expect(screen.getByLabelText("reward")).toBeTruthy();
    expect(screen.getByLabelText("withdrawal")).toBeTruthy();
    // Not yet narrowed: a rule without selected values stays inactive.
    expect(screen.getByTestId("matched").textContent).toBe("4");
    expect(screen.getByText("csvImport.filterRuleInactive")).toBeTruthy();
  });

  it("filters to the selected values (21bitcoin case: only trades)", () => {
    render(<Harness />);
    addRule();
    fireEvent.change(columnSelects()[0], { target: { value: "transaction_type" } });
    fireEvent.click(screen.getByLabelText("trade"));

    expect(screen.getByTestId("matched").textContent).toBe("2");
  });

  it("negates a condition with 'is none of'", () => {
    render(<Harness />);
    addRule();
    fireEvent.change(columnSelects()[0], { target: { value: "transaction_type" } });
    fireEvent.click(screen.getByLabelText("trade"));
    const matchSelect = screen
      .getAllByRole("combobox")
      .find((el) => within(el).queryByRole("option", { name: "csvImport.filterMatchNoneOf" }))!;
    fireEvent.change(matchSelect, { target: { value: "isNoneOf" } });

    expect(screen.getByTestId("matched").textContent).toBe("2");
  });

  it("combines two conditions with AND, and switches them to OR", () => {
    render(<Harness />);
    addRule();
    fireEvent.change(columnSelects()[0], { target: { value: "transaction_type" } });
    fireEvent.click(screen.getByLabelText("trade"));

    addRule();
    fireEvent.change(columnSelects()[1], { target: { value: "asset" } });
    fireEvent.click(screen.getByLabelText("ETH"));

    // trade AND ETH → one row
    expect(screen.getByTestId("matched").textContent).toBe("1");

    fireEvent.click(screen.getByRole("button", { name: "csvImport.filterCombinator.or" }));
    // trade OR ETH → both trades (the ETH one is a trade as well)
    expect(screen.getByTestId("matched").textContent).toBe("2");
  });

  it("resets the selected values when the column changes", () => {
    const seen: RowFilter[] = [];
    render(<Harness onFilter={(f) => seen.push(f)} />);
    addRule();
    fireEvent.change(columnSelects()[0], { target: { value: "transaction_type" } });
    fireEvent.click(screen.getByLabelText("trade"));
    expect(screen.getByTestId("matched").textContent).toBe("2");

    fireEvent.change(columnSelects()[0], { target: { value: "asset" } });

    expect(seen.at(-1)!.rules[0]).toEqual({
      column: "asset",
      match: "isAnyOf",
      values: [],
    });
    expect(screen.getByTestId("matched").textContent).toBe("4");
  });

  it("removes a condition again", () => {
    render(<Harness />);
    addRule();
    fireEvent.change(columnSelects()[0], { target: { value: "transaction_type" } });
    fireEvent.click(screen.getByLabelText("trade"));
    expect(screen.getByTestId("matched").textContent).toBe("2");

    fireEvent.click(screen.getByLabelText("csvImport.filterRemoveRule"));

    expect(screen.getByTestId("matched").textContent).toBe("4");
  });
});
