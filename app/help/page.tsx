import type { Metadata } from "next";
import HelpPage from "@/components/HelpPage";
import { staticPageAlternates } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Help — DepotWatch Orange",
  description:
    "How to use DepotWatch Orange: recording transactions, importing CSV files, assigning transfers, taxes, backups and settings.",
  alternates: staticPageAlternates("help", "en"),
};

export default function Page() {
  return <HelpPage />;
}
