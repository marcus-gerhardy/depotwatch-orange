"use client";

// Rendering one help section.
//
// The blocks arrive already parsed (see lib/help/types.ts); what is left is the
// inline layer — bold, code and links — and that is parsed here into React
// elements rather than into HTML. Nothing in the help ever goes through
// `dangerouslySetInnerHTML`: documentation is text in a file somebody edits,
// and it must not be able to put markup into the app.
//
// Links come in two kinds and behave differently on purpose. A link into the
// help itself moves *within* the current surface — inside the panel it must not
// navigate the app away from what the reader was doing. A link to an app page
// ("So funktioniert's") is a real navigation and gets a real anchor.

import Link from "next/link";
import { useState } from "react";
import type { HelpBlock } from "@/lib/help/types";

/** One piece of inline text. */
export type Inline =
  | { kind: "text"; text: string }
  | { kind: "strong"; text: string }
  | { kind: "code"; text: string }
  | { kind: "link"; text: string; href: string };

const INLINE_RE = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;

/**
 * Split a line into inline pieces. Deliberately small: bold, code, links.
 * Anything else is text, including a stray asterisk — help content is prose,
 * and a parser that tries to be clever about prose gets it wrong on the one
 * sentence that mentions an asterisk.
 */
export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE_RE)) {
    const at = match.index ?? 0;
    if (at > last) out.push({ kind: "text", text: text.slice(last, at) });
    const token = match[0];
    if (token.startsWith("**")) {
      out.push({ kind: "strong", text: token.slice(2, -2) });
    } else if (token.startsWith("`")) {
      out.push({ kind: "code", text: token.slice(1, -1) });
    } else {
      const split = token.indexOf("](");
      out.push({
        kind: "link",
        text: token.slice(1, split),
        href: token.slice(split + 2, -1),
      });
    }
    last = at + token.length;
  }
  if (last < text.length) out.push({ kind: "text", text: text.slice(last) });
  return out;
}

/** Is this a link into the help itself? Then it stays inside the surface. */
export function helpTargetOf(href: string): string | null {
  const m = /^\/(?:hilfe|help)\/([a-z0-9-]+)(?:#([a-z0-9-]+))?$/.exec(href);
  return m ? (m[2] ?? m[1]) : null;
}

function InlineText({
  text,
  onNavigate,
}: {
  text: string;
  onNavigate?: (target: string) => void;
}) {
  return (
    <>
      {parseInline(text).map((piece, i) => {
        if (piece.kind === "strong") return <strong key={i}>{piece.text}</strong>;
        if (piece.kind === "code") {
          return (
            <code key={i} className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[0.9em]">
              {piece.text}
            </code>
          );
        }
        if (piece.kind === "link") {
          const target = helpTargetOf(piece.href);
          if (target && onNavigate) {
            return (
              <button
                key={i}
                type="button"
                onClick={() => onNavigate(target)}
                className="text-accent underline decoration-dotted"
              >
                {piece.text}
              </button>
            );
          }
          return (
            <Link
              key={i}
              href={piece.href}
              className="text-accent underline decoration-dotted"
            >
              {piece.text}
            </Link>
          );
        }
        return <span key={i}>{piece.text}</span>;
      })}
    </>
  );
}

/**
 * A screenshot, and what happens when there is none.
 *
 * Screenshots are generated (`npm run help:screenshots`) rather than committed
 * by hand, so a fresh checkout may not have them yet. A broken image icon in
 * the middle of a paragraph would look like a defect; the alt text as a caption
 * does not, and the help reads perfectly well without pictures.
 */
function Screenshot({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <figure className="rounded-lg border border-dashed border-border-c p-3 text-center">
        <figcaption className="text-xs text-muted">{alt}</figcaption>
      </figure>
    );
  }
  return (
    <figure className="space-y-1">
      {/* Plain <img>: the file is a local asset of known origin and next/image
          would only add a loader between it and the page. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onError={() => setFailed(true)}
        className="w-full rounded-lg border border-border-c"
      />
      <figcaption className="text-xs text-muted">{alt}</figcaption>
    </figure>
  );
}

export default function HelpBlocks({
  blocks,
  onNavigate,
}: {
  blocks: HelpBlock[];
  /** Follow a link into another help section without leaving this surface. */
  onNavigate?: (target: string) => void;
}) {
  return (
    <div className="space-y-3 text-sm leading-relaxed text-muted">
      {blocks.map((block, i) => {
        switch (block.kind) {
          case "p":
            return (
              <p key={i}>
                <InlineText text={block.text} onNavigate={onNavigate} />
              </p>
            );
          case "h3":
            return (
              <h4 key={i} className="pt-1 text-sm font-semibold text-foreground">
                <InlineText text={block.text} onNavigate={onNavigate} />
              </h4>
            );
          case "ul":
            return (
              <ul key={i} className="list-disc space-y-1 pl-5">
                {block.items.map((item, j) => (
                  <li key={j}>
                    <InlineText text={item} onNavigate={onNavigate} />
                  </li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={i} className="list-decimal space-y-1 pl-5">
                {block.items.map((item, j) => (
                  <li key={j}>
                    <InlineText text={item} onNavigate={onNavigate} />
                  </li>
                ))}
              </ol>
            );
          case "note":
            return (
              <p
                key={i}
                className="rounded-lg border border-accent/30 bg-accent/5 p-3 text-xs leading-relaxed"
              >
                <InlineText text={block.text} onNavigate={onNavigate} />
              </p>
            );
          case "image":
            return <Screenshot key={i} src={block.src} alt={block.alt} />;
        }
      })}
    </div>
  );
}
