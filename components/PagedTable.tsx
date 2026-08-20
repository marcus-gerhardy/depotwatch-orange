"use client";

// A table that is one table per sheet when it is printed (CLAUDE.md §5.4).
//
// `thead { display: table-header-group }` already repeats a header across a
// page break, and for a short table that is enough. For a savings plan's two
// hundred lots it is not: what comes out is one table torn across eight
// sheets, where no page says what it is, which part of the whole it holds, or
// whether anything is missing — and a stack of such sheets cannot be checked
// or handed on.
//
// So the rows are cut into pages here, and each page gets a complete table:
// its own caption, its own header, and its own "part n of m". The break is
// declared rather than left to the layout engine, which is also what makes the
// count honest — the app decides where a page ends, so it knows.
//
// On screen the same markup has to read as *one* table:
//
//  • the repeated headers are hidden (`print:table-header-group` brings them
//    back on paper), so the chunks join up visually;
//  • the columns are fixed and shared, or two chunks would size their columns
//    independently and the seam would be visible;
// Which rows the screen shows stays with the caller: it renders every row and
// hides the ones past its own limit (§5.3), because CSS cannot bring back a
// row that was never rendered and the printed report needs all of them.

import { Fragment, type ReactNode } from "react";
import { useI18n } from "@/lib/i18n";

/**
 * Rows per printed page. Chosen for A4 with the standard margins and the
 * caption above each table, and deliberately a little short: a long account
 * name wraps to two lines on paper (nothing may be cut off there), and a row
 * that spills onto a sheet of its own looks like a defect.
 */
export const PRINT_ROWS_PER_PAGE = 22;

export default function PagedTable({
  caption,
  head,
  rows,
  columns,
  rowsPerPage = PRINT_ROWS_PER_PAGE,
}: {
  /** What this table is; printed above every page of it. */
  caption: string;
  /** The header row — one `<tr>`, rendered into every chunk's `<thead>`. */
  head: ReactNode;
  /** One `<tr>` per row, in order. */
  rows: ReactNode[];
  /** Relative column widths, so every chunk lines up on screen. */
  columns: string[];
  /**
   * Rows per sheet, where the default does not fit. A table with more columns
   * has taller rows, and a page of them has to be counted by what actually
   * fits rather than by what fits a narrow table.
   */
  rowsPerPage?: number;
}) {
  const { t } = useI18n();
  const pages: ReactNode[][] = [];
  for (let i = 0; i < rows.length; i += rowsPerPage) {
    pages.push(rows.slice(i, i + rowsPerPage));
  }
  if (pages.length === 0) pages.push([]);

  return (
    <div className="overflow-x-auto">
      {pages.map((page, pageIndex) => {
        const firstRow = pageIndex * rowsPerPage;
        return (
          <Fragment key={pageIndex}>
            {/* Every printed page of a long table starts on its own sheet and
                says which part of the whole it is. */}
            {pages.length > 1 && (
              // Every part on its own sheet, the first one included: a table
              // that begins halfway down page two and continues overleaf is
              // exactly the torn-up look this component exists to avoid.
              <p className="hidden text-[10pt] font-semibold print:block print:break-before-page">
                {caption}
                {" — "}
                {t("print.partOf", { part: pageIndex + 1, total: pages.length })}
              </p>
            )}
            <table className="w-full table-fixed text-sm">
              <colgroup>
                {columns.map((width, i) => (
                  <col key={i} style={{ width }} />
                ))}
              </colgroup>
              {/* Only the first chunk shows its header on screen — the rest
                  would look like a table restarting mid-list. */}
              <thead className={pageIndex > 0 ? "hidden print:table-header-group" : ""}>
                {head}
              </thead>
              <tbody>
                {page.map((row, i) => (
                  <Fragment key={firstRow + i}>{row}</Fragment>
                ))}
              </tbody>
            </table>
          </Fragment>
        );
      })}
    </div>
  );
}
