import type { Metadata } from "next";
import PrivacyPolicyPage from "@/components/PrivacyPolicyPage";
import { staticPageAlternates } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Datenschutz — DepotWatch Orange",
  alternates: staticPageAlternates("privacy", "de"),
};

export default function Page() {
  return <PrivacyPolicyPage />;
}
