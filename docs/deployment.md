# Deployment

The app is a **static export** (`output: "export"` in `next.config.ts`): `npm run build` writes `out/`, which is plain HTML, JS, CSS and assets. There is no server component, no API route and no runtime — any static host works, and Vercel is only one of them.

## Vercel

Framework preset **Next.js**; build command `npm run build`, output directory `out`. Nothing else is required — no environment variables, because the app has no secrets and no back end to talk to.

`vercel.json` carries what a static export cannot express in `next.config.ts`: response headers. Next's `headers()` option is ignored under `output: "export"` (there is no server to run it), so the headers live in the host's config.

### The headers, and why each is set

- **`Content-Security-Policy`** is the important one for an app whose whole promise is that data stays on the device.
  - `default-src 'self'` plus `object-src 'none'`, `base-uri 'self'`, `form-action 'none'`: nothing loads from elsewhere, no plugin content, no injected `<base>`, and no form can post anywhere. The app has no forms that submit and no back end to submit to.
  - `frame-ancestors 'none'` blocks framing outright — clickjacking a portfolio app is worth ruling out, and nothing legitimate embeds it.
  - `font-src 'self'`: the three typefaces ship with the app (§5), so a CDN font request would be a bug, and this makes it a blocked bug.
  - `img-src 'self' data: blob:`: `data:` for the drawn icons, `blob:` for the year-in-review image the browser builds locally.
  - **`connect-src 'self' https:`** is deliberately not narrower. The app lets the user configure **their own Electrum/Esplora server** for on-chain queries (§3.3, and it is the privacy-preserving option), so an allowlist of the two public explorers would break exactly the setup that leaks least. `https:` still rules out plain `http:`, `ws:`, and `data:` as exfiltration channels.
  - `script-src`/`style-src` need `'unsafe-inline'`: Next inlines its bootstrap, and the theme is applied by an inline script before the first paint so nothing flashes in the wrong colours. A nonce needs a server to mint it, which a static export does not have. The trade is accepted knowingly: with no user input rendered as markup anywhere (the help renders parsed structures, never HTML) and no third-party script, the realistic injection surface is small.
- **`Strict-Transport-Security`** with `preload`: two years, subdomains included. Only set this once the domain is definitely staying on HTTPS — it is not quickly reversible.
- **`Referrer-Policy: no-referrer`**: the app links out (whitepaper, explorers, GitHub). No outbound link should tell anyone which page of a portfolio tool somebody came from.
- **`Cross-Origin-Opener-Policy`/`Cross-Origin-Resource-Policy`**: isolate the browsing context; nothing here is meant to be embedded or read cross-origin.
- **Caching**: hashed assets under `/_next/static` and the fonts are immutable for a year. Everything else stays on the host's defaults, so an HTML change is picked up on the next visit.

### After the domain is connected

1. Set the production domain in Vercel and let it issue the certificate.
2. Check `app/layout.tsx` → `metadataBase` matches the live domain (canonical URLs and `sitemap.xml` are derived from it).
3. Verify the headers are actually served: `curl -sI https://<domain> | grep -i content-security`.
4. Re-run `npm run help:screenshots` if the UI changed since the last commit.

## Any other static host

Copy `out/` to the document root. Two things the host has to do:

- serve `404.html` for unknown paths;
- serve the headers above (nginx `add_header`, Caddy `header`, or the host's equivalent).

Clean URLs work either way: the export writes both `/hilfe.html` and `/hilfe/index.html`-style paths for the localized routes.
