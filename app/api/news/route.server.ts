// The feed proxy route (docs/news.md).
//
// `route.server.ts`, not `route.ts`: the default build is a static export and
// has no runtime to mount a route in, so this file is only a route in the
// server build, where `next.config.ts` adds `server.ts` to `pageExtensions`.
// In the export build it is an ordinary colocated file — type-checked and
// linted like any other, never mounted, never shipped. One copy of the code,
// two build targets.
//
// Everything it does lives in `lib/news/proxy.ts`, which is framework-free and
// unit-tested against a fake `fetch`. What is left here is the adapter, and it
// is meant to stay this short: the allowlist, the redirect policy, the cache
// and the size limits are properties of the proxy, not of Next.

import { handleNewsRequest, newsResponseHeaders } from "@/lib/news/proxy";

export async function GET(request: Request): Promise<Response> {
  // Only the `feed` parameters are read, and only feed URLs are ever sent on.
  // Nothing about the reader is looked at: no cookie, no header, no body.
  const payload = await handleNewsRequest(new URL(request.url));
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: newsResponseHeaders(),
  });
}
