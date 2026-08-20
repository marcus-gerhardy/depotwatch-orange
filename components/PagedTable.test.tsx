/** @vitest-environment jsdom */
// A long table has to come out of the printer as one table per sheet: every
// page carrying its own caption, its own header and its part number, and no
// row lost between two of them (CLAUDE.md §5.4).

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { I18nProvider } from "@/lib/i18n";
import PagedTable, { PRINT_ROWS_PER_PAGE } from "./PagedTable";

afterEach(cleanup);

const head = (
  <tr>
    <th>Erworben</th>
    <th>Menge</th>
  </tr>
);

const rowsOf = (n: number) =>
  Array.from({ length: n }, (_, i) => (
    <tr key={i}>
      <td>{`Zeile ${i + 1}`}</td>
      <td>{i + 1}</td>
    </tr>
  ));

const paged = (n: number, rowsPerPage?: number) =>
  render(
    <I18nProvider locale="de">
      <PagedTable
        caption="Offene Lots"
        head={head}
        rows={rowsOf(n)}
        columns={["50%", "50%"]}
        rowsPerPage={rowsPerPage}
      />
    </I18nProvider>,
  );

describe("PagedTable", () => {
  it("renders one table with no caption while everything fits on a sheet", () => {
    paged(5);
    expect(document.querySelectorAll("table")).toHaveLength(1);
    // The part number is a statement about a stack of sheets; a single page is
    // not a stack, and "Teil 1 von 1" would be noise on it.
    expect(screen.queryByText(/Teil/)).toBeNull();
  });

  it("cuts a long table into a complete table per sheet", () => {
    paged(50, 20);
    const tables = document.querySelectorAll("table");
    expect(tables).toHaveLength(3);
    // Every chunk carries the header, not just the first — that is the whole
    // point: a sheet nobody can read the columns of is a sheet wasted.
    for (const table of tables) {
      expect(table.querySelectorAll("thead th")).toHaveLength(2);
    }
    const captions = [...document.querySelectorAll("p")].map((p) => p.textContent);
    expect(captions).toHaveLength(3);
    for (const [i, caption] of captions.entries()) {
      expect(caption).toContain("Offene Lots");
      // The numbers are what makes a loose sheet placeable in the stack.
      expect(caption).toContain(`Teil ${i + 1} von 3`);
    }
  });

  it("loses no row and keeps them in order across the cut", () => {
    paged(50, 20);
    const cells = [...document.querySelectorAll("tbody td:first-child")].map((c) => c.textContent);
    expect(cells).toHaveLength(50);
    expect(cells[0]).toBe("Zeile 1");
    expect(cells[20]).toBe("Zeile 21"); // the first row of the second sheet
    expect(cells[49]).toBe("Zeile 50");
  });

  it("starts every part on a fresh sheet, the first one included", () => {
    paged(50, 20);
    const captions = [...document.querySelectorAll("p")];
    expect(captions).toHaveLength(3);
    // A table that begins halfway down a sheet and runs over the page break is
    // exactly what this component exists to prevent, so part one breaks too.
    for (const caption of captions) {
      expect(caption.className).toContain("print:break-before-page");
    }
  });

  it("hides the repeated headers on screen so the chunks read as one table", () => {
    paged(50, 20);
    const heads = [...document.querySelectorAll("thead")];
    expect(heads[0].className).not.toContain("hidden");
    for (const h of heads.slice(1)) {
      expect(h.className).toContain("hidden");
      expect(h.className).toContain("print:table-header-group");
    }
  });

  it("shares one fixed column geometry, so no seam shows between two chunks", () => {
    paged(50, 20);
    for (const table of document.querySelectorAll("table")) {
      expect(table.className).toContain("table-fixed");
      const widths = [...table.querySelectorAll("col")].map((c) => (c as HTMLElement).style.width);
      expect(widths).toEqual(["50%", "50%"]);
    }
  });

  it("still renders a table when there is nothing in it", () => {
    paged(0);
    expect(document.querySelectorAll("table")).toHaveLength(1);
    expect(document.querySelectorAll("tbody tr")).toHaveLength(0);
  });

  it("fills every sheet but the last one", () => {
    paged(PRINT_ROWS_PER_PAGE + 1);
    const bodies = [...document.querySelectorAll("tbody")].map((b) => b.querySelectorAll("tr").length);
    expect(bodies).toEqual([PRINT_ROWS_PER_PAGE, 1]);
  });
});
