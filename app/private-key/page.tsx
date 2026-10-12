import type { Metadata } from "next";
import KeyLabPage from "@/components/keyLab/KeyLabPage";
import { staticPageAlternates } from "@/lib/routes";

// English URL for /privater-schluessel — same component, English metadata.
export const metadata: Metadata = {
  title: "From Randomness to Address — DepotWatch Orange",
  description:
    "Learning page: how randomness becomes a Bitcoin private key, a public key and an address — with a key generator for learning purposes only.",
  alternates: staticPageAlternates("keyLab", "en"),
};

export default function Page() {
  return <KeyLabPage />;
}
