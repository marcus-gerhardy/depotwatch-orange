import type { Metadata } from "next";
import ImprintPage from "@/components/ImprintPage";
import { staticPageAlternates } from "@/lib/routes";

// English URL for /impressum.
export const metadata: Metadata = {
  title: "Legal Notice — DepotWatch Orange",
  alternates: staticPageAlternates("imprint", "en"),
};

export default function Page() {
  return <ImprintPage />;
}
