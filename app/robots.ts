import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// A static robots.txt, written into the export. Everything here is public
// documentation and a client app — there is nothing to keep out of an index,
// and no server paths to disallow.
export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/" }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
