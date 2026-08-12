import type { MetadataRoute } from "next";
import { HELP_CONTENT } from "@/lib/help/content";
import { STATIC_PAGE_PATHS, helpTopicPath } from "@/lib/routes";
import { SITE_URL } from "@/lib/site";

// Both language variants of every page, each pointing at the other through
// `alternates` — the pages exist under a localized path rather than a prefix
// (see lib/routes.ts), so a crawler has no way to pair them up by itself.
export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const url = (path: string) => `${SITE_URL}${path}`;
  const entries: MetadataRoute.Sitemap = [
    { url: url("/"), changeFrequency: "monthly", priority: 1 },
  ];

  for (const paths of Object.values(STATIC_PAGE_PATHS)) {
    for (const locale of ["de", "en"] as const) {
      entries.push({
        url: url(paths[locale]),
        changeFrequency: "monthly",
        priority: paths === STATIC_PAGE_PATHS.help ? 0.8 : 0.3,
        alternates: { languages: { de: url(paths.de), en: url(paths.en) } },
      });
    }
  }

  for (const topic of HELP_CONTENT.de) {
    for (const locale of ["de", "en"] as const) {
      entries.push({
        url: url(helpTopicPath(topic.id, locale)),
        changeFrequency: "monthly",
        priority: 0.6,
        alternates: {
          languages: {
            de: url(helpTopicPath(topic.id, "de")),
            en: url(helpTopicPath(topic.id, "en")),
          },
        },
      });
    }
  }

  return entries;
}
