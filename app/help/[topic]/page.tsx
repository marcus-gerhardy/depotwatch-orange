import type { Metadata } from "next";
import HelpPage from "@/components/HelpPage";
import { HELP_CONTENT } from "@/lib/help/content";
import { helpTopicPath } from "@/lib/routes";

/**
 * One static page per topic, so every topic has a URL that can be linked to
 * and opened cold. The list comes from the generated content, which means a
 * new Markdown file becomes a route without anybody remembering to add one.
 */
export function generateStaticParams() {
  return HELP_CONTENT.en.map((topic) => ({ topic: topic.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ topic: string }>;
}): Promise<Metadata> {
  const { topic } = await params;
  const entry = HELP_CONTENT.en.find((t) => t.id === topic);
  return {
    title: `${entry?.title ?? "Help"} — Help — DepotWatch Orange`,
    description: entry?.summary,
    alternates: {
      canonical: helpTopicPath(topic, "en"),
      languages: { de: helpTopicPath(topic, "de"), en: helpTopicPath(topic, "en") },
    },
  };
}

export default async function Page({
  params,
}: {
  params: Promise<{ topic: string }>;
}) {
  const { topic } = await params;
  return <HelpPage topicId={topic} />;
}
