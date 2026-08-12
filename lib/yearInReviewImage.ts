// Drawing the year in review onto a canvas (CLAUDE.md §4.2).
//
// Separate from the component for two reasons: it is pixels rather than React,
// and it is the one piece of this feature that no rendered test can look at, so
// it has to be checkable on its own.
//
// It reads nothing. Colours, fonts and the lines to print are handed in — the
// colours as literals, because a canvas cannot resolve a CSS variable, and the
// lines already filtered by `lib/yearInReviewShare.ts`, which is what decides
// whether absolute amounts may appear at all.

import type { ThemeTokens } from "./theme";
import type { ShareStat } from "./yearInReviewShare";

/** A square, because that is what survives every timeline uncropped. */
export const SHARE_SIZE = 1080;
const PADDING = 88;
/** Space the header takes before the first row. */
const HEADER = 200;

export interface ShareImageSpec {
  title: string;
  subtitle: string;
  stats: ShareStat[];
  footer: string;
  colors: ThemeTokens;
  /** Font families to draw with, taken from the document rather than named here. */
  fontBody: string;
  fontHeading: string;
}

/**
 * Draw the image. Row height and font size are derived from how many lines
 * there are, so switching the absolute amounts on (which adds up to six lines)
 * cannot push the last one off the bottom edge.
 */
export function drawShareImage(canvas: HTMLCanvasElement, spec: ShareImageSpec): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { colors } = spec;
  canvas.width = SHARE_SIZE;
  canvas.height = SHARE_SIZE;

  ctx.fillStyle = colors.background;
  ctx.fillRect(0, 0, SHARE_SIZE, SHARE_SIZE);

  // One bar of the accent along the top, the only decoration there is.
  ctx.fillStyle = colors.accent;
  ctx.fillRect(0, 0, SHARE_SIZE, 12);

  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.fillStyle = colors.muted;
  ctx.font = `500 30px ${spec.fontBody}`;
  ctx.fillText(spec.subtitle, PADDING, PADDING + 46);

  ctx.fillStyle = colors.accent;
  ctx.font = `700 76px ${spec.fontHeading}`;
  ctx.fillText(spec.title, PADDING, PADDING + 136);

  const top = PADDING + HEADER;
  const bottom = SHARE_SIZE - PADDING - 40;
  const rows = Math.max(spec.stats.length, 1);
  const rowHeight = Math.min(78, (bottom - top) / rows);
  const fontSize = Math.max(18, Math.min(32, rowHeight * 0.42));

  spec.stats.forEach((stat, i) => {
    const rowTop = top + rowHeight * i;
    const baseline = rowTop + rowHeight * 0.68;
    ctx.fillStyle = colors.border;
    ctx.fillRect(PADDING, rowTop, SHARE_SIZE - PADDING * 2, 1);

    ctx.fillStyle = colors.muted;
    ctx.font = `400 ${fontSize}px ${spec.fontBody}`;
    ctx.textAlign = "left";
    ctx.fillText(stat.label, PADDING, baseline);

    ctx.fillStyle = colors.foreground;
    ctx.font = `600 ${fontSize}px ${spec.fontBody}`;
    ctx.textAlign = "right";
    ctx.fillText(stat.value, SHARE_SIZE - PADDING, baseline);
  });

  ctx.textAlign = "left";
  ctx.fillStyle = colors.muted;
  ctx.font = `400 24px ${spec.fontBody}`;
  ctx.fillText(spec.footer, PADDING, SHARE_SIZE - PADDING + 24);
}
