import type { Metadata } from "next";
import PrivacyPolicyPage from "@/components/PrivacyPolicyPage";
import { staticPageAlternates } from "@/lib/routes";

// English URL for /datenschutz.
export const metadata: Metadata = {
  title: "Privacy — DepotWatch Orange",
  alternates: staticPageAlternates("privacy", "en"),
};

export default function Page() {
  return <PrivacyPolicyPage />;
}
