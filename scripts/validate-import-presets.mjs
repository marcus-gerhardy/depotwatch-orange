#!/usr/bin/env node
// Validate every shipped CSV import preset: `npm run presets:validate`.
//
// These files are contributed (config/import-presets/README.md), so they are
// the one piece of configuration in this repository that arrives from outside.
// A broken one would fail at the worst possible moment — in the middle of
// somebody's import, on a file the app cannot show — so it fails here instead,
// in the build.
//
// The schema is the source of truth: `config/import-presets/schema.json`, read
// at run time by the shared validator in `scripts/lib/json-schema.mjs` rather
// than restated in JavaScript. `lib/importPresetFile.test.ts` holds the schema
// and the app's own validator to the same enums, so a value the build accepts
// can never be one the app refuses.
//
// On top of the schema come the checks a schema cannot express: ids unique
// across files, file name matching the id, `fixedType` not competing with a
// mapped type column, and — the important one — no personal data anywhere.

import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { validate } from "./lib/json-schema.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const DIR = join(ROOT, "config", "import-presets");
const SCHEMA_FILE = "schema.json";

// ---------------------------------------------------------------------------
// What a schema cannot say
// ---------------------------------------------------------------------------

const EMAIL = /[\w.+-]+@[\w-]+\.[a-z]{2,}/i;
const IBAN = /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/;
const HEX64 = /^[0-9a-f]{64}$/i;
const BASE58_ADDRESS = /^[13][1-9A-HJ-NP-Za-km-z]{25,34}$/;
const BECH32_ADDRESS = /^(bc1|tb1|bcrt1)[02-9ac-hj-np-z]{6,}$/i;
const NUMERIC = /^[+-]?\d[\d\s.,']*$/;

/**
 * Same rule as `personalDataReason` in lib/importPresetFile.ts: config values
 * are short words, and anything reading as an address, a txid, an amount, an
 * e-mail address or an IBAN is data instead. Restated here rather than
 * imported because this script runs on plain JS before any build step; the
 * cases are pinned by a test on the TypeScript side.
 */
function personalDataReason(value) {
  const v = String(value).trim();
  if (v === "") return null;
  if (HEX64.test(v)) return "a transaction id";
  if (BASE58_ADDRESS.test(v) || BECH32_ADDRESS.test(v)) return "a bitcoin address";
  if (EMAIL.test(v)) return "an e-mail address";
  if (IBAN.test(v)) return "an IBAN";
  if (NUMERIC.test(v) && (/[.,]/.test(v) || v.replace(/\D/g, "").length > 4)) {
    return "an amount";
  }
  return null;
}

function semanticErrors(preset, fileName) {
  const errors = [];

  if (`${preset.id}.json` !== fileName) {
    errors.push(`file name should be "${preset.id}.json" to match the id`);
  }
  if (preset.fixedType && preset.columnMapping?.type) {
    errors.push(
      `has both "fixedType" and a mapped "type" column — one row type or a column deciding it, not both`,
    );
  }
  const candidates = [
    ...(preset.headerSignature ?? []).map((v) => ["headerSignature", v]),
    ...Object.keys(preset.valueMapping ?? {}).map((v) => ["valueMapping", v]),
    ...Object.values(preset.columnMapping ?? {}).map((v) => ["columnMapping", v]),
    ...(preset.rowFilter?.rules ?? []).flatMap((rule) =>
      (rule.values ?? []).map((v) => ["rowFilter", v]),
    ),
  ];
  for (const [where, value] of candidates) {
    const reason = personalDataReason(value);
    if (reason) {
      errors.push(
        `${where}: "${value}" looks like ${reason} — presets carry configuration only (see README.md)`,
      );
    }
  }
  return errors;
}

// ---------------------------------------------------------------------------

const schema = JSON.parse(readFileSync(join(DIR, SCHEMA_FILE), "utf8"));
const files = readdirSync(DIR)
  .filter((f) => f.endsWith(".json") && f !== SCHEMA_FILE)
  .sort();

const seenIds = new Map();
let failed = 0;

for (const file of files) {
  const errors = [];
  let preset = null;
  try {
    preset = JSON.parse(readFileSync(join(DIR, file), "utf8"));
  } catch (e) {
    errors.push(`not valid JSON: ${e.message}`);
  }

  if (preset !== null) {
    validate(preset, schema, schema, "", errors);
    errors.push(...semanticErrors(preset, file));
    const clash = seenIds.get(preset.id);
    if (clash) errors.push(`id "${preset.id}" is already used by ${clash}`);
    else if (preset.id) seenIds.set(preset.id, file);
  }

  if (errors.length > 0) {
    failed++;
    console.error(`✗ ${file}`);
    for (const e of errors) console.error(`    ${e}`);
  } else {
    console.log(`✓ ${file}`);
  }
}

if (files.length === 0) {
  console.log("No import presets to validate.");
}

if (failed > 0) {
  console.error(`\n${failed} of ${files.length} preset file(s) invalid.`);
  process.exit(1);
}
