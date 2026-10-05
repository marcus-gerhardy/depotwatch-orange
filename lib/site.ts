// Where the app lives, in one place.
//
// Canonical URLs, the sitemap and the Open Graph tags are all resolved against
// this, so a wrong value here is wrong everywhere at once — and it is exactly
// the kind of thing that goes unnoticed until a search engine indexes a
// preview deployment.
//
// Vercel exposes the production domain as an environment variable at build
// time; the literal is the fallback for a local build and for any other host.
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_ENV === "production" && process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "https://depotwatch-orange.com");

/**
 * Where the source lives. Written out in the footer and on "how it works",
 * and sent as part of the news proxy's User-Agent (docs/news.md) — an administrator
 * who sees the request in a log should be one click from knowing what it is.
 */
export const REPOSITORY_URL = "https://github.com/marcus-gerhardy/depotwatch-orange";
