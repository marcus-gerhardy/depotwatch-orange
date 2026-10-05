import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
import type { NextConfig } from "next";

/**
 * Two build targets, and the default is unchanged.
 *
 * `npm run build` is what it always was: a **static export**. No server, no
 * runtime, no API route — `out/` is plain files and any static host serves it
 * (docs/deployment.md). That is not a detail of the hosting, it is the app's
 * promise made structural: a deployment with nothing running behind it cannot
 * receive anybody's data, whatever its code says.
 *
 * `npm run build:server` (DEPOTWATCH_TARGET=server) produces the same app with
 * one thing added: the feed proxy the news widget needs (docs/news.md). Feeds
 * do not send CORS headers, so a browser cannot read them directly — the
 * widget is the one feature in the app that cannot work without something in
 * between.
 *
 * The switch is `pageExtensions` rather than an exclusion, because Next
 * decides what is a route from the file name: the handler is written as
 * `app/api/news/route.server.ts`, which is not a route in the default build —
 * it is an ordinary colocated file, type-checked and linted like any other,
 * but never mounted and never exported. Adding `server.ts` to the extensions
 * mounts it at `/api/news`. So the export build cannot accidentally ship a
 * route it has no runtime for, and the server build cannot drift out of sync
 * with a second copy of the code, because there is only one copy.
 *
 * **`next dev` serves the route**, unless `DEPOTWATCH_TARGET=export` says
 * otherwise. Development is not a deployment: a local server that answers 404
 * for a route the app ships makes the news widget impossible to build, to
 * demo or to debug, which is exactly what the first version of this file did.
 * `npm run dev:export` is the other side of that — the dev server configured
 * like the static export, for checking that nothing has crept in which the
 * export build could not carry. The gate is still `npm run build`.
 */
function target(phase: string): "export" | "server" {
  const requested = process.env.DEPOTWATCH_TARGET;
  if (requested === "server" || requested === "export") return requested;
  return phase === PHASE_DEVELOPMENT_SERVER ? "server" : "export";
}

export default function config(phase: string): NextConfig {
  const server = target(phase) === "server";
  return {
    // Pure client app — no user data ever touches a server.
    ...(server ? {} : { output: "export" as const }),
    pageExtensions: server
      ? ["tsx", "ts", "jsx", "js", "server.ts"]
      : ["tsx", "ts", "jsx", "js"],
  };
}
