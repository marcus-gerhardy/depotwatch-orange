// The mark a wallet wears in the wallet list: one drawn icon per kind of
// wallet, in the accent the user picked.
//
// Both come from fixed sets (lib/walletMeta.ts). The accents are names for the
// theme's own chart tokens, never colour values, so every theme recolours
// them along with everything else (CLAUDE.md §5). The class names are spelled
// out in full below because Tailwind only generates what it can find verbatim.

import type { ReactNode } from "react";
import type { WalletColorId, WalletIconId } from "@/lib/types";
import { KEY, LineIcon, SHIELD, iconDot } from "./icons";

const ICONS: Record<WalletIconId, ReactNode> = {
  // A building with columns: somebody else's house.
  exchange: (
    <>
      <path d="M3.5 9 12 4l8.5 5" />
      <path d="M4.5 20h15M5.5 17.5h13" />
      <path d="M7 10.5v5M10.3 10.5v5M13.7 10.5v5M17 10.5v5" />
    </>
  ),
  // A signing device: small screen, two buttons.
  hardware: (
    <>
      <rect x="7" y="3" width="10" height="18" rx="2.2" />
      <rect x="9.3" y="5.8" width="5.4" height="4.4" rx="0.6" />
      {iconDot(10.3, 15)}
      {iconDot(13.7, 15)}
    </>
  ),
  // A phone.
  software: (
    <>
      <rect x="6.5" y="2.5" width="11" height="19" rx="2.6" />
      <path d="M10.5 18.6h3" />
      <path d="M9.3 7.5h5.4M9.3 10.5h5.4M9.3 13.5h3" />
    </>
  ),
  // A sheet with a folded corner.
  paper: (
    <>
      <path d="M6 3h8.5L19 7.5V21H6V3Z" />
      <path d="M14.5 3v4.5H19" />
      <path d="M9 11.5h7M9 14.5h7M9 17.5h4" />
    </>
  ),
  vault: (
    <>
      <rect x="3.5" y="4" width="17" height="15" rx="2" />
      <circle cx="12" cy="11.5" r="3.4" />
      <path d="M12 8.1v1.2M12 13.7v1.2M8.6 11.5h1.2M14.2 11.5h1.2" />
      <path d="M6.5 19v1.8M17.5 19v1.8" />
    </>
  ),
  piggy: (
    <>
      <path d="M4.5 12.5c0-3.6 3.4-6 7.5-6 2.6 0 4.9.9 6.2 2.5L20.5 8v4l-1.6.9c-.4 1.3-1.3 2.4-2.6 3.1V19h-2.5v-2.2a9 9 0 0 1-3.6 0V19H7.7v-3.1c-2-1-3.2-2.3-3.2-3.4Z" />
      <path d="M10 6.9V5.5h3.5v1.2" />
      {iconDot(16.2, 10.6, 0.9)}
    </>
  ),
  shield: SHIELD,
  key: KEY,
};

export function WalletIcon({
  icon,
  className = "h-5 w-5",
}: {
  icon: WalletIconId;
  className?: string;
}) {
  return <LineIcon className={className}>{ICONS[icon]}</LineIcon>;
}

/** Utility classes per accent: text, fill, and the left stripe of a card. */
export const WALLET_COLOR_CLASSES: Record<
  WalletColorId,
  { text: string; bg: string; border: string; soft: string }
> = {
  "chart-1": {
    text: "text-chart-1",
    bg: "bg-chart-1",
    border: "border-l-chart-1",
    soft: "bg-chart-1/15",
  },
  "chart-2": {
    text: "text-chart-2",
    bg: "bg-chart-2",
    border: "border-l-chart-2",
    soft: "bg-chart-2/15",
  },
  "chart-3": {
    text: "text-chart-3",
    bg: "bg-chart-3",
    border: "border-l-chart-3",
    soft: "bg-chart-3/15",
  },
  "chart-4": {
    text: "text-chart-4",
    bg: "bg-chart-4",
    border: "border-l-chart-4",
    soft: "bg-chart-4/15",
  },
  muted: {
    text: "text-muted",
    bg: "bg-muted",
    border: "border-l-muted",
    soft: "bg-muted/15",
  },
};

/**
 * The icon on its tile. Custody is drawn, not only coloured: an exchange's
 * tile has a dashed ring, so "somebody else holds these" reads at a glance and
 * without telling colours apart.
 */
export function WalletTile({
  icon,
  color,
  custodial,
  className = "h-10 w-10",
}: {
  icon: WalletIconId;
  color: WalletColorId;
  custodial: boolean;
  className?: string;
}) {
  const c = WALLET_COLOR_CLASSES[color];
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-lg ${c.soft} ${c.text} ${
        custodial ? "border border-dashed border-current" : ""
      } ${className}`}
    >
      <WalletIcon icon={icon} />
    </span>
  );
}
