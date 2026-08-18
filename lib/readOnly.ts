"use client";

// The read-only mode as the UI sees it (CLAUDE.md §6.7).
//
// The lock itself lives in the store: `mutate` and `persist` refuse, so an
// action that slips past a disabled button changes nothing. What is here is the
// *second* layer — controls that say they are locked and why, instead of
// looking broken.

import { useI18n } from "./i18n";
import { useAppStore } from "./store";

export interface ReadOnlyState {
  readOnly: boolean;
  /**
   * Spread onto a control that changes the file:
   * `<Button {...locked.props} onClick={…}>`. Disabled with a reason, and a
   * plain object when editing is on, so the call site stays one line.
   */
  props: { disabled?: boolean; title?: string };
}

export function useReadOnly(): ReadOnlyState {
  const { t } = useI18n();
  const readOnly = useAppStore((s) => s.readOnly);
  return {
    readOnly,
    props: readOnly ? { disabled: true, title: t("readOnly.disabledHint") } : {},
  };
}

/** Leaving the mode is confirmed, so it cannot be undone by a stray click. */
export function useLeaveReadOnly(): () => void {
  const { t } = useI18n();
  const setReadOnly = useAppStore((s) => s.setReadOnly);
  return () => {
    if (confirm(t("readOnly.disableConfirm"))) setReadOnly(false);
  };
}
