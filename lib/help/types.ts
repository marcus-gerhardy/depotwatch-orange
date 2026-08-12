// The help content model (CLAUDE.md §8).
//
// Help is written as Markdown under `content/help/<locale>/`, and a build step
// (`scripts/build-help.py`) turns it into the structure below. Two reasons for
// a generated module rather than a Markdown loader:
//
//  • the app is a **static export that must work offline** — content has to be
//    in the bundle, not fetched, and not parsed in the browser;
//  • a parsed structure renders as React elements, so nothing ever goes
//    through `dangerouslySetInnerHTML`. Documentation is text somebody edits in
//    a file; it should not be able to inject markup into the app.
//
// The Markdown subset is small on purpose and documented in the build script.
// What matters here is that **section ids are written by hand**, never derived
// from headings: a deep link into the help is a URL somebody may have saved,
// and rewording a heading must not break it.

import type { Locale } from "../types";

export type HelpBlock =
  | { kind: "p"; text: string }
  | { kind: "h3"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "note"; text: string }
  | { kind: "image"; src: string; alt: string };

export interface HelpSection {
  /** Hand-written, stable, unique across the whole help. */
  id: string;
  title: string;
  blocks: HelpBlock[];
  /** Everything above as plain text, for the search. */
  text: string;
}

export interface HelpTopic {
  id: string;
  title: string;
  /** One line under the title, shown in the topic list too. */
  summary: string;
  sections: HelpSection[];
}

export type HelpContent = Record<Locale, HelpTopic[]>;

/** Where a section lives, for links and for search results. */
export interface HelpLocation {
  topicId: string;
  sectionId: string;
}

/** Find the topic a section belongs to. */
export function locateSection(
  topics: HelpTopic[],
  sectionId: string,
): HelpLocation | null {
  for (const topic of topics) {
    if (topic.sections.some((s) => s.id === sectionId)) {
      return { topicId: topic.id, sectionId };
    }
  }
  return null;
}

/**
 * Resolve what a help link points at. A target is either a topic id or a
 * section id — callers pass whichever they know, and `HelpButton` passes a
 * section, because a button next to a field means "explain *this*".
 */
export function resolveTarget(
  topics: HelpTopic[],
  target: string | null,
): HelpLocation | null {
  if (!target) return null;
  const topic = topics.find((t) => t.id === target);
  if (topic) {
    return { topicId: topic.id, sectionId: topic.sections[0]?.id ?? "" };
  }
  return locateSection(topics, target);
}

export interface HelpHit {
  topicId: string;
  topicTitle: string;
  sectionId: string;
  sectionTitle: string;
  /** The passage the match was found in, trimmed around the first term. */
  excerpt: string;
  score: number;
}

const EXCERPT_RADIUS = 70;

function excerptAround(text: string, index: number): string {
  const start = Math.max(0, index - EXCERPT_RADIUS);
  const end = Math.min(text.length, index + EXCERPT_RADIUS);
  return `${start > 0 ? "… " : ""}${text.slice(start, end).trim()}${
    end < text.length ? " …" : ""
  }`;
}

/**
 * Full-text search across the help, in the reader's own language.
 *
 * Deliberately a plain scan rather than an index: fifteen topics are a few
 * hundred sections at most, so the whole corpus is smaller than the index
 * would be, and there is nothing to keep in sync. A title match outranks a body
 * match, and every term has to appear somewhere in the section — a search for
 * "csv preset" should not return everything that mentions CSV.
 */
export function searchHelp(topics: HelpTopic[], query: string): HelpHit[] {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1);
  if (terms.length === 0) return [];

  const hits: HelpHit[] = [];
  for (const topic of topics) {
    for (const section of topic.sections) {
      const haystack = `${section.title}\n${section.text}`.toLowerCase();
      if (!terms.every((term) => haystack.includes(term))) continue;

      const title = section.title.toLowerCase();
      let score = 0;
      for (const term of terms) {
        if (title.includes(term)) score += 10;
        if (topic.title.toLowerCase().includes(term)) score += 4;
        // Repetition counts, but with a sharply diminishing return: a word
        // used eight times is not eight times as relevant.
        score += Math.min(3, haystack.split(term).length - 1);
      }
      const at = section.text.toLowerCase().indexOf(terms[0]);
      hits.push({
        topicId: topic.id,
        topicTitle: topic.title,
        sectionId: section.id,
        sectionTitle: section.title,
        excerpt: at >= 0 ? excerptAround(section.text, at) : excerptAround(section.text, 0),
        score,
      });
    }
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, 20);
}

export function helpTopicsFor(content: HelpContent, locale: Locale): HelpTopic[] {
  return content[locale] ?? content.de;
}
