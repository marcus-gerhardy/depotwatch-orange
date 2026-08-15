// One place that turns a validation issue into a sentence, because both sides
// of the exchange show them: the export dialog (what is still missing before
// this file can be shared) and the import (why this file was refused). A
// message that names the field and the allowed values is the whole difference
// between "invalid preset" and a contributor being able to fix their file.

import type { TranslateFn } from "./i18n";
import type { PresetIssue } from "./importPresetFile";

export function presetIssueText(t: TranslateFn, issue: PresetIssue): string {
  const message = t(`presets.issue.${issue.code}`, {
    field: issue.path,
    detail: issue.detail ?? "",
  });
  return issue.path ? `${issue.path}: ${message}` : message;
}
