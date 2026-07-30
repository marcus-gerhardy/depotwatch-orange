"use client";

// Row filter editor for the CSV import wizard (step 2): any number of
// conditions "column is (not) one of <values>", combined with AND or OR.
// Values are offered as a multi-select of the values actually present in the
// chosen column, so the filter always matches the file at hand.

import { useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import {
  columnValueCounts,
  type RowFilter,
  type RowFilterMatch,
  type RowFilterRule,
} from "@/lib/csvImport";
import { Button, Field, inputCls } from "./ui";

/** Above this many distinct values the picker gets a search box. */
const SEARCH_THRESHOLD = 8;

export default function CsvRowFilter({
  headers,
  rows,
  filter,
  onChange,
}: {
  headers: string[];
  /** All data rows (unfiltered) — the value lists come from these. */
  rows: string[][];
  filter: RowFilter;
  onChange: (filter: RowFilter) => void;
}) {
  const { t } = useI18n();
  const [search, setSearch] = useState<Record<number, string>>({});

  const updateRule = (index: number, patch: Partial<RowFilterRule>) =>
    onChange({
      ...filter,
      rules: filter.rules.map((r, i) => (i === index ? { ...r, ...patch } : r)),
    });

  const removeRule = (index: number) => {
    onChange({ ...filter, rules: filter.rules.filter((_, i) => i !== index) });
    setSearch({});
  };

  const addRule = () =>
    onChange({
      ...filter,
      rules: [...filter.rules, { column: "", match: "isAnyOf", values: [] }],
    });

  return (
    <div className="space-y-3">
      {filter.rules.map((rule, index) => (
        <div key={index} className="space-y-2">
          {index > 0 && (
            <div className="flex items-center gap-2">
              <span className="h-px flex-1 bg-border-c/60" />
              <div className="inline-flex overflow-hidden rounded-lg border border-border-c text-xs">
                {(["and", "or"] as const).map((c) => (
                  <button
                    key={c}
                    aria-pressed={filter.combinator === c}
                    onClick={() => onChange({ ...filter, combinator: c })}
                    className={`px-2.5 py-1 transition-colors ${
                      filter.combinator === c
                        ? "bg-accent/15 text-accent"
                        : "text-muted hover:text-foreground"
                    }`}
                  >
                    {t(`csvImport.filterCombinator.${c}`)}
                  </button>
                ))}
              </div>
              <span className="h-px flex-1 bg-border-c/60" />
            </div>
          )}

          <RuleCard
            rule={rule}
            headers={headers}
            rows={rows}
            search={search[index] ?? ""}
            onSearch={(v) => setSearch((s) => ({ ...s, [index]: v }))}
            onChange={(patch) => updateRule(index, patch)}
            onRemove={() => removeRule(index)}
          />
        </div>
      ))}

      <Button onClick={addRule}>+ {t("csvImport.filterAddRule")}</Button>
    </div>
  );
}

function RuleCard({
  rule,
  headers,
  rows,
  search,
  onSearch,
  onChange,
  onRemove,
}: {
  rule: RowFilterRule;
  headers: string[];
  rows: string[][];
  search: string;
  onSearch: (value: string) => void;
  onChange: (patch: Partial<RowFilterRule>) => void;
  onRemove: () => void;
}) {
  const { t } = useI18n();

  const values = useMemo(
    () => (rule.column === "" ? [] : columnValueCounts(rows, headers, rule.column)),
    [rows, headers, rule.column],
  );
  const unknownColumn = rule.column !== "" && !headers.includes(rule.column);
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q === "" ? values : values.filter((v) => v.value.toLowerCase().includes(q));
  }, [values, search]);

  const toggleValue = (value: string) =>
    onChange({
      values: rule.values.includes(value)
        ? rule.values.filter((v) => v !== value)
        : [...rule.values, value],
    });

  return (
    <div className="space-y-2 rounded-lg border border-border-c bg-surface-2/40 p-3">
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Field label={t("csvImport.filterColumn")}>
            <select
              className={inputCls}
              value={headers.includes(rule.column) ? rule.column : ""}
              // A different column has different values — the old selection
              // would silently never match again.
              onChange={(e) => {
                onChange({ column: e.target.value, values: [] });
                onSearch("");
              }}
            >
              <option value="">{t("csvImport.filterColumnChoose")}</option>
              {headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="flex-1">
          <Field label={t("csvImport.filterMatch")}>
            <select
              className={inputCls}
              value={rule.match}
              onChange={(e) => onChange({ match: e.target.value as RowFilterMatch })}
            >
              <option value="isAnyOf">{t("csvImport.filterMatchAnyOf")}</option>
              <option value="isNoneOf">{t("csvImport.filterMatchNoneOf")}</option>
            </select>
          </Field>
        </div>
        <button
          onClick={onRemove}
          title={t("csvImport.filterRemoveRule")}
          aria-label={t("csvImport.filterRemoveRule")}
          className="rounded-lg border border-transparent px-2.5 py-1.5 text-sm text-muted transition-colors hover:border-loss/40 hover:bg-loss/10 hover:text-loss"
        >
          ✕
        </button>
      </div>

      {unknownColumn && (
        <p className="text-xs text-warning">
          ⚠ {t("csvImport.filterUnknownColumn", { column: rule.column })}
        </p>
      )}

      {rule.column !== "" && !unknownColumn && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs text-muted">
            <span>{t("csvImport.filterValues")}</span>
            <span className="ml-auto flex gap-2">
              <button
                className="hover:text-accent"
                onClick={() => onChange({ values: values.map((v) => v.value) })}
              >
                {t("csvImport.filterSelectAll")}
              </button>
              <button
                className="hover:text-accent"
                onClick={() => onChange({ values: [] })}
              >
                {t("csvImport.filterSelectNone")}
              </button>
            </span>
          </div>

          {values.length > SEARCH_THRESHOLD && (
            <input
              className={inputCls}
              placeholder={t("csvImport.filterSearch")}
              value={search}
              onChange={(e) => onSearch(e.target.value)}
            />
          )}

          <div className="max-h-40 overflow-auto rounded-lg border border-border-c bg-background p-1.5">
            {shown.length === 0 ? (
              <p className="px-1 py-1.5 text-xs text-muted">
                {t("csvImport.filterNoValues")}
              </p>
            ) : (
              shown.map(({ value, count }) => (
                <label
                  key={value}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-surface-2"
                >
                  <input
                    type="checkbox"
                    // Labelled by the raw value alone — the row also shows the
                    // occurrence count, which is not part of the choice.
                    aria-label={value}
                    checked={rule.values.includes(value)}
                    onChange={() => toggleValue(value)}
                  />
                  <span className="min-w-0 flex-1 truncate font-mono text-xs" title={value}>
                    {value}
                  </span>
                  <span className="shrink-0 text-[11px] text-muted">{count}</span>
                </label>
              ))
            )}
          </div>

          {rule.values.length === 0 && (
            <p className="text-xs text-muted">{t("csvImport.filterRuleInactive")}</p>
          )}
        </div>
      )}
    </div>
  );
}
