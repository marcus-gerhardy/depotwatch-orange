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
