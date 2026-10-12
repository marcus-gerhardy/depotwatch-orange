import type { Metadata } from "next";
import KeyLabPage from "@/components/keyLab/KeyLabPage";
import { staticPageAlternates } from "@/lib/routes";

// Static metadata covers the default (German) locale; the client component
// updates the document title when the interface language is English.
export const metadata: Metadata = {
  title: "Vom Zufall zur Adresse — DepotWatch Orange",
  description:
    "Lernseite: Wie aus Zufall ein privater Bitcoin-Schlüssel, ein öffentlicher Schlüssel und eine Adresse wird — mit Schlüsselgenerator nur zu Lernzwecken.",
  alternates: staticPageAlternates("keyLab", "de"),
};

export default function Page() {
  return <KeyLabPage />;
}
