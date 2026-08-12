"use client";

// Sharing the year in review as an image (CLAUDE.md §4.2).
//
// The whole point of this app is that opening a portfolio tells nobody. An
// export that quietly puts the holding into a PNG would undo that in one click,
// so two rules hold here:
//
//   1. The image is drawn **in the browser**, on a canvas, and handed to the
//      user as a download. Nothing is uploaded, no service renders it, no
//      request leaves the machine — which is also why there is no "share to X"
//      button: the app has no business talking to anyone.
//   2. **Absolute amounts are off by default.** What somebody owns in bitcoin
//      is a personal security matter, not a privacy preference, and an image
//      outlives the moment it was posted in. The switch that turns them on says
//      so in as many words. Which lines count as absolute is decided once, in
//      `lib/yearInReviewShare.ts`, where it is unit-tested.
//
// The privacy mode of the header (blurred amounts) wins over the switch: with
// it on, absolute figures cannot be put into an image at all. Screen-sharing
// and publishing one's holding are the same risk, and the two settings must not
// be able to contradict each other.

import { useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { useThemeColors } from "@/lib/appearance";
import { drawShareImage } from "@/lib/yearInReviewImage";
import { hiddenStatCount, shareStats } from "@/lib/yearInReviewShare";
import type { YearReview } from "@/lib/yearInReview";
import { Button, Switch } from "./ui";

export default function YearInReviewShare({
  review,
  loc,
}: {
  review: YearReview;
  loc: string;
}) {
  const { t } = useI18n();
  const colors = useThemeColors();
  const privacyMode = useAppStore((s) => s.privacyMode);
  const currency = useAppStore((s) => s.portfolio!.settings.currencyDisplay);
  const [absolute, setAbsolute] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Privacy mode and "show absolute amounts" are the same decision seen from
  // two sides. With the blur on, the image cannot carry the figures either.
  const allowAbsolute = absolute && !privacyMode;
  const options = { t, loc, absolute: allowAbsolute, sats: currency === "BTC" };
  const stats = shareStats(review, options);
  const hidden = hiddenStatCount(review, options);

  function download() {
    const canvas = document.createElement("canvas");
    if (typeof canvas.getContext !== "function") return;
    // The bundled faces are on the document, not in this module — ask the DOM
    // which families are actually in use rather than naming them again here.
    const styles = rootRef.current
      ? getComputedStyle(rootRef.current)
      : { fontFamily: "sans-serif" };
    const fontBody = styles.fontFamily || "sans-serif";
    drawShareImage(canvas, {
      title: t("yearInReview.share.imageTitle", { year: review.year }),
      subtitle: t("app.name"),
      stats,
      footer: t("yearInReview.share.imageFooter"),
      colors,
      fontBody,
      fontHeading: fontBody,
    });
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = t("yearInReview.share.fileName", { year: review.year });
      a.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  }

  return (
    <div
      ref={rootRef}
      className="space-y-3 rounded-xl border border-border-c bg-surface p-4"
    >
      <div>
        <h2 className="text-sm font-semibold">{t("yearInReview.share.title")}</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          {t("yearInReview.share.localOnly")}
        </p>
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-border-c/60 bg-surface-2/40 p-3">
        <Switch
          checked={allowAbsolute}
          disabled={privacyMode}
          onChange={setAbsolute}
          label={t("yearInReview.share.absolute")}
        />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium">{t("yearInReview.share.absolute")}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted">
            {privacyMode
              ? t("yearInReview.share.privacyBlocked")
              : allowAbsolute
                ? t("yearInReview.share.absoluteWarning")
                : t("yearInReview.share.absoluteHint", { count: hidden })}
          </p>
        </div>
      </div>

      {/* What the image will say, exactly — no surprises inside a PNG. */}
      <div>
        <p className="mb-1 text-xs text-muted">{t("yearInReview.share.preview")}</p>
        <ul className="rounded-lg border border-border-c/60">
          {stats.map((s) => (
            <li
              key={s.key}
              className="flex items-baseline justify-between gap-3 border-b border-border-c/40 px-3 py-1.5 text-xs last:border-0"
            >
              <span className="text-muted">{s.label}</span>
              <span className="font-mono">{s.value}</span>
            </li>
          ))}
        </ul>
      </div>

      <Button variant="primary" onClick={download}>
        {t("yearInReview.share.download")}
      </Button>
    </div>
  );
}
