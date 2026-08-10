// Central widget registry.
//
// A new dashboard widget is exactly one entry in WIDGETS: it declares its id,
// how it is labelled, its default and allowed size, which data it needs, and
// the component to render. Nothing in Dashboard.tsx, DashboardGrid.tsx or the
// picker knows any widget by name, so adding one never touches them.
//
// Widget components take no props — they read the shared portfolio figures
// from `useDashboardData()` (see context.tsx).

import type { ComponentType } from "react";
import {
  AvgCostWidget,
  BtcPriceWidget,
  PnlWidget,
  PortfolioValueWidget,
  SatsStackWidget,
} from "./ValueWidgets";
import {
  CustodyWidget,
  DataQualityWidget,
  HoldingCompositionWidget,
  HoldingPeriodWidget,
  WalletBreakdownWidget,
} from "./LedgerWidgets";
import { DcaWidget, PortfolioChartWidget, PriceEntriesWidget } from "./ChartWidgets";
import { HalvingWidget, NetworkFeesWidget } from "./ChainWidgets";

/**
 * What a widget reads. Shown in the picker so it is obvious up front which
 * tiles talk to a third party: "price" goes to Binance, "explorer" to the
 * explorer configured in the settings, "ledger" stays entirely local.
 */
export type WidgetDataSource = "ledger" | "price" | "priceHistory" | "explorer";

export interface WidgetSize {
  w: number;
  h: number;
}

export interface WidgetDefinition {
  id: string;
  /** i18n key of the title shown in the widget header and the picker. */
  titleKey: string;
  /** i18n key of the one-line description in the picker. */
  descriptionKey: string;
  /** Emoji preview, used as the picker icon and in the widget header. */
  icon: string;
  defaultSize: WidgetSize;
  minSize: WidgetSize;
  maxSize?: WidgetSize;
  dataSources: WidgetDataSource[];
  component: ComponentType;
}

export const WIDGETS: WidgetDefinition[] = [
  {
    id: "portfolioValue",
    titleKey: "dashboard.widgets.portfolioValue.title",
    descriptionKey: "dashboard.widgets.portfolioValue.description",
    icon: "💰",
    defaultSize: { w: 4, h: 4 },
    minSize: { w: 3, h: 3 },
    maxSize: { w: 12, h: 6 },
    dataSources: ["ledger", "price", "priceHistory"],
    component: PortfolioValueWidget,
  },
  {
    id: "pnl",
    titleKey: "dashboard.widgets.pnl.title",
    descriptionKey: "dashboard.widgets.pnl.description",
    icon: "📈",
    defaultSize: { w: 4, h: 4 },
    minSize: { w: 3, h: 3 },
    maxSize: { w: 12, h: 6 },
    dataSources: ["ledger", "price"],
    component: PnlWidget,
  },
  {
    id: "btcPrice",
    titleKey: "dashboard.widgets.btcPrice.title",
    descriptionKey: "dashboard.widgets.btcPrice.description",
    icon: "₿",
    defaultSize: { w: 4, h: 4 },
    minSize: { w: 2, h: 3 },
    maxSize: { w: 12, h: 5 },
    dataSources: ["price"],
    component: BtcPriceWidget,
  },
  {
    id: "holdingPeriod",
    titleKey: "dashboard.widgets.holdingPeriod.title",
    descriptionKey: "dashboard.widgets.holdingPeriod.description",
    icon: "⏳",
    defaultSize: { w: 6, h: 7 },
    minSize: { w: 3, h: 4 },
    dataSources: ["ledger"],
    component: HoldingPeriodWidget,
  },
  {
    id: "satsStack",
    titleKey: "dashboard.widgets.satsStack.title",
    descriptionKey: "dashboard.widgets.satsStack.description",
    icon: "🧱",
    defaultSize: { w: 4, h: 4 },
    minSize: { w: 3, h: 4 },
    maxSize: { w: 12, h: 6 },
    dataSources: ["ledger"],
    component: SatsStackWidget,
  },
  {
    id: "avgCost",
    titleKey: "dashboard.widgets.avgCost.title",
    descriptionKey: "dashboard.widgets.avgCost.description",
    icon: "🎯",
    defaultSize: { w: 4, h: 4 },
    minSize: { w: 3, h: 4 },
    maxSize: { w: 12, h: 6 },
    dataSources: ["ledger", "price"],
    component: AvgCostWidget,
  },
  {
    id: "custody",
    titleKey: "dashboard.widgets.custody.title",
    descriptionKey: "dashboard.widgets.custody.description",
    icon: "🔐",
    defaultSize: { w: 4, h: 5 },
    minSize: { w: 3, h: 4 },
    dataSources: ["ledger", "price"],
    component: CustodyWidget,
  },
  {
    id: "priceEntries",
    titleKey: "dashboard.widgets.priceEntries.title",
    descriptionKey: "dashboard.widgets.priceEntries.description",
    icon: "🕯",
    defaultSize: { w: 8, h: 8 },
    minSize: { w: 4, h: 5 },
    dataSources: ["ledger", "priceHistory"],
    component: PriceEntriesWidget,
  },
  {
    id: "networkFees",
    titleKey: "dashboard.widgets.networkFees.title",
    descriptionKey: "dashboard.widgets.networkFees.description",
    icon: "⛽",
    defaultSize: { w: 4, h: 5 },
    minSize: { w: 3, h: 4 },
    maxSize: { w: 12, h: 7 },
    dataSources: ["explorer"],
    component: NetworkFeesWidget,
  },
  {
    id: "halving",
    titleKey: "dashboard.widgets.halving.title",
    descriptionKey: "dashboard.widgets.halving.description",
    icon: "⛏",
    defaultSize: { w: 4, h: 6 },
    minSize: { w: 3, h: 5 },
    maxSize: { w: 12, h: 8 },
    dataSources: ["explorer"],
    component: HalvingWidget,
  },
  {
    id: "dataQuality",
    titleKey: "dashboard.widgets.dataQuality.title",
    descriptionKey: "dashboard.widgets.dataQuality.description",
    icon: "🩺",
    defaultSize: { w: 4, h: 3 },
    minSize: { w: 3, h: 3 },
    maxSize: { w: 12, h: 6 },
    dataSources: ["ledger"],
    component: DataQualityWidget,
  },
  {
    id: "dca",
    titleKey: "dashboard.widgets.dca.title",
    descriptionKey: "dashboard.widgets.dca.description",
    icon: "🔁",
    defaultSize: { w: 6, h: 6 },
    minSize: { w: 4, h: 5 },
    dataSources: ["ledger"],
    component: DcaWidget,
  },
  {
    id: "portfolioChart",
    titleKey: "dashboard.widgets.portfolioChart.title",
    descriptionKey: "dashboard.widgets.portfolioChart.description",
    icon: "📉",
    defaultSize: { w: 8, h: 8 },
    minSize: { w: 4, h: 6 },
    dataSources: ["ledger", "priceHistory"],
    component: PortfolioChartWidget,
  },
  {
    id: "walletBreakdown",
    titleKey: "dashboard.widgets.walletBreakdown.title",
    descriptionKey: "dashboard.widgets.walletBreakdown.description",
    icon: "🗂",
    defaultSize: { w: 6, h: 6 },
    minSize: { w: 4, h: 4 },
    dataSources: ["ledger", "price"],
    component: WalletBreakdownWidget,
  },
  {
    id: "holdingComposition",
    titleKey: "dashboard.widgets.holdingComposition.title",
    descriptionKey: "dashboard.widgets.holdingComposition.description",
    icon: "🧮",
    defaultSize: { w: 6, h: 7 },
    minSize: { w: 4, h: 5 },
    dataSources: ["ledger"],
    component: HoldingCompositionWidget,
  },
];

export const WIDGETS_BY_ID = new Map(WIDGETS.map((w) => [w.id, w]));

export const WIDGET_IDS = new Set(WIDGETS.map((w) => w.id));
