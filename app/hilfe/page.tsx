import type { Metadata } from "next";
import HelpPage from "@/components/HelpPage";
import { staticPageAlternates } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Hilfe — DepotWatch Orange",
  description:
    "Anleitung zu DepotWatch Orange: Transaktionen erfassen, CSV importieren, Überträge zuordnen, Steuern, Backups und Einstellungen.",
  alternates: staticPageAlternates("help", "de"),
};

export default function Page() {
  return <HelpPage />;
}
