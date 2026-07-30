import type { Metadata } from "next";
import ImprintPage from "@/components/ImprintPage";
import { staticPageAlternates } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Impressum — DepotWatch Orange",
  alternates: staticPageAlternates("imprint", "de"),
};

export default function Page() {
  return <ImprintPage />;
}
