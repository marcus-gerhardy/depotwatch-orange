#!/usr/bin/env node
// Validate the shipped news feed list: `npm run feeds:validate`.
//
// This file matters more than an ordinary piece of configuration, because it
// is two things at once (config/news-feeds/README.md): the sources the widget
// offers, and the **allowlist** the proxy route accepts. A malformed or
// careless entry is therefore not a cosmetic problem — it is the difference
// between a route that fetches nine known feeds and a route that fetches
// whatever it is handed.
//
// The schema (`config/news-feeds/schema.json`) is the source of truth, read at
// run time by the shared validator in `scripts/lib/json-schema.mjs`. On top of
// it come the checks a schema cannot express: ids unique, no feed URL listed
// twice, every URL a parseable absolute HTTPS URL with a public host and no
// credentials in it.
//
// Deliberately offline: nothing here calls a feed. A build must not depend on
// nine publishers being reachable, and a fetching check would fail in every
// checkout without a network.

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { validate } from "./lib/json-schema.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const DIR = join(ROOT, "config", "news-feeds");

/**
 * Hosts a shipped feed may never point at. The route re-checks this at run
 * time for user-added feeds (`lib/news/urlPolicy.ts`); here it is about the
 * list in the repository, where such an entry would be a mistake rather than
 * an attack.
 */
const PRIVATE_HOST =
  /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[|0\.0\.0\.0$|.*\.local$|.*\.internal$)/i;

/** `field` of `source` has to be an absolute, public, credential-free HTTPS URL. */
function urlErrors(value, where) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return [`${where}: "${value}" is not a URL`];
  }
  const errors = [];
  if (url.protocol !== "https:") errors.push(`${where}: must be https, is ${url.protocol}`);
  if (url.username || url.password) errors.push(`${where}: carries credentials`);
  if (PRIVATE_HOST.test(url.hostname)) {
    errors.push(`${where}: "${url.hostname}" is not a public host`);
  }
  if (!url.hostname.includes(".")) errors.push(`${where}: "${url.hostname}" has no public suffix`);
  return errors;
}

/** The checks the schema cannot state. */
function semanticErrors(list) {
  const errors = [];
  const ids = new Map();
  const urls = new Map();

  for (const [i, source] of (list.sources ?? []).entries()) {
    const where = `sources[${i}]`;
    if (typeof source !== "object" || source === null) continue;

    const clashId = ids.get(source.id);
    if (clashId !== undefined) {
      // An id is what a muted or disabled source is remembered by in somebody's
      // portfolio file, so two entries sharing one would silently apply one
      // user's choice to the other source.
      errors.push(`${where}: id "${source.id}" is already used by sources[${clashId}]`);
    } else if (source.id) {
      ids.set(source.id, i);
    }

    if (typeof source.url === "string") {
      const clashUrl = urls.get(source.url);
      if (clashUrl !== undefined) {
        errors.push(`${where}: the same feed URL is already listed as sources[${clashUrl}]`);
      } else {
        urls.set(source.url, i);
      }
    }

    for (const field of ["url", "homepage", "terms"]) {
      if (typeof source[field] === "string") {
        errors.push(...urlErrors(source[field], `${where}.${field}`));
      }
    }
  }
  return errors;
}

// ---------------------------------------------------------------------------

const schema = JSON.parse(readFileSync(join(DIR, "schema.json"), "utf8"));
const errors = [];
let list = null;

try {
  list = JSON.parse(readFileSync(join(DIR, "feeds.json"), "utf8"));
} catch (e) {
  errors.push(`not valid JSON: ${e.message}`);
}

if (list !== null) {
  validate(list, schema, schema, "", errors);
  errors.push(...semanticErrors(list));
}

if (errors.length > 0) {
  console.error("✗ feeds.json");
  for (const e of errors) console.error(`    ${e}`);
  process.exit(1);
}

console.log(`✓ feeds.json (${list.sources.length} sources)`);
