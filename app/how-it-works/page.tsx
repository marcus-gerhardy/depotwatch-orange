import type { Metadata } from "next";
import HowItWorksPage from "@/components/HowItWorksPage";
import { staticPageAlternates } from "@/lib/routes";

// English URL for /so-funktionierts — same component, English metadata.
export const metadata: Metadata = {
  title: "How It Works — DepotWatch Orange",
  description:
    "How DepotWatch Orange works: local-first, one encrypted file, no server. The security architecture in detail.",
  alternates: staticPageAlternates("howItWorks", "en"),
};

export default function Page() {
  return <HowItWorksPage />;
}
