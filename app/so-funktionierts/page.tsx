import type { Metadata } from "next";
import HowItWorksPage from "@/components/HowItWorksPage";
import { staticPageAlternates } from "@/lib/routes";

// Static metadata covers the default (German) locale; the client component
// updates the document title when the interface language is English.
export const metadata: Metadata = {
  title: "So funktioniert's — DepotWatch Orange",
  description:
    "Wie DepotWatch Orange funktioniert: Local-First, eine verschlüsselte Datei, kein Server. Die Sicherheitsarchitektur im Detail.",
  alternates: staticPageAlternates("howItWorks", "de"),
};

export default function Page() {
  return <HowItWorksPage />;
}
