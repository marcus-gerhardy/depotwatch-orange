/**
 * The app's mark, wherever its name is written out (header, start screen, lock
 * screen, footer, the static pages).
 *
 * It is the **block** — the same object as the shipped icon (assets/icon.svg,
 * and with it the favicon, the touch icon and the manifest icons), so what sits
 * in the tab strip and what sits beside the name are one mark rather than two.
 * A block is what the chain is made of, and it is a container: one object
 * holding everything, which is the premise of this app — one file, on your
 * device, holding the whole portfolio.
 *
 * Drawn, not typed. The lockup used to be a literal bitcoin sign (U+20BF), and
 * **none of the three bundled fonts contains that character** (app/fonts), so
 * it was at the mercy of whatever the device fell back to and rendered as an
 * empty box on one without the glyph. That is the same argument every icon in
 * the app is drawn under (CLAUDE.md §5): a character has no guaranteed
 * presentation.
 *
 * Geometry: the 24×24 box the drawn icons share, `currentColor`, stroke width
 * 1.6, round joins. The one filled shape is the face in shadow — what turns an
 * outline into an object, and what keeps it readable at 20 px, where a
 * wireframe cube turns into a scribble.
 */
export default function BrandMark({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={`h-[1em] w-[1em] ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      {/* The silhouette: a cube seen corner-on from above. */}
      <path d="M12 3.4 3.8 8.1v7.9L12 20.6l8.2-4.6V8.1L12 3.4Z" />
      {/* The face in shadow, and the seam to the lit one. */}
      <path fill="currentColor" fillOpacity="0.9" d="M12 12 3.8 8.1v7.9L12 20.6V12Z" />
      <path d="M12 12l8.2-3.9" />
    </svg>
  );
}
