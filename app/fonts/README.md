# Bundled fonts

The app ships its typefaces itself — nothing is fetched from Google, neither by
the browser at runtime nor by the build. That is the same reason the rest of the
app has no third-party requests: opening a portfolio must not tell anyone that
it happened.

| File | Family | Licence |
| --- | --- | --- |
| `Outfit-Variable.woff2` | [Outfit](https://fonts.google.com/specimen/Outfit) — body text | SIL Open Font License 1.1 |
| `SpaceGrotesk-Variable.woff2` | [Space Grotesk](https://fonts.google.com/specimen/Space+Grotesk) — headings | SIL Open Font License 1.1 |
| `GeistMono-Variable.woff2` | [Geist Mono](https://fonts.google.com/specimen/Geist+Mono) — amounts, ids, addresses | SIL Open Font License 1.1 |

All three are the **variable** cut (one file covers every weight) of the
**latin** subset, which is what the interface languages (German, English) and
the currency symbols need. Text outside that subset — say a wallet name in
Polish — falls back to the system sans; the alternative would be preloading a
second file per family for glyphs that almost never appear.

They are wired up in `app/layout.tsx` via `next/font/local`, which hashes and
serves them from the app's own origin and emits the preload hints.

To update one, download the `latin` variable woff2 that
`https://fonts.googleapis.com/css2?family=<Family>&display=swap` points to (with
a browser user agent, otherwise Google serves ttf) and replace the file.
