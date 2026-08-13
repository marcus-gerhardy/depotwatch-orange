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
import { TAX_FEATURES_ENABLED } from "@/lib/features";
import {
  AvgCostWidget,
  BtcPriceWidget,
  PnlWidget,
  PortfolioValueWidget,
  SatsStackWidget,
  WhatIfWidget,
} from "./ValueWidgets";
import {
  CustodyWidget,
  DataQualityWidget,
  FeeBalanceWidget,
  MilestonesWidget,
  HoldingCompositionWidget,
  HoldingPeriodWidget,
  TimeInMarketWidget,
  WalletBreakdownWidget,
} from "./LedgerWidgets";
import {
  BuyHeatmapWidget,
  DcaWidget,
  PortfolioChartWidget,
  PriceEntriesWidget,
  StackHistoryWidget,
} from "./ChartWidgets";
import { BlockClockWidget, HalvingWidget, NetworkFeesWidget } from "./ChainWidgets";
import { ExemptionLimitWidget, TaxFreeProceedsWidget } from "./TaxWidgets";
import { UtxoOverviewWidget, WatchlistStatusWidget } from "./WatchlistWidgets";
import { YearInReviewWidget } from "./YearInReviewWidget";

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
  defaultSize: WidgetSize;
  minSize: WidgetSize;
  maxSize?: WidgetSize;
  dataSources: WidgetDataSource[];
  component: ComponentType;
}

const BASE_WIDGETS: WidgetDefinition[] = [
  {
    id: "portfolioValue",
    titleKey: "dashboard.widgets.portfolioValue.title",
    descriptionKey: "dashboard.widgets.portfolioValue.description",
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
    defaultSize: { w: 6, h: 7 },
    minSize: { w: 3, h: 4 },
    dataSources: ["ledger"],
    component: HoldingPeriodWidget,
  },
  {
    id: "satsStack",
    titleKey: "dashboard.widgets.satsStack.title",
    descriptionKey: "dashboard.widgets.satsStack.description",
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
    defaultSize: { w: 4, h: 5 },
    minSize: { w: 3, h: 4 },
    dataSources: ["ledger", "price"],
    component: CustodyWidget,
  },
  {
    id: "priceEntries",
    titleKey: "dashboard.widgets.priceEntries.title",
    descriptionKey: "dashboard.widgets.priceEntries.description",
    defaultSize: { w: 8, h: 8 },
    minSize: { w: 4, h: 5 },
    dataSources: ["ledger", "priceHistory"],
    component: PriceEntriesWidget,
  },
  {
    id: "networkFees",
    titleKey: "dashboard.widgets.networkFees.title",
    descriptionKey: "dashboard.widgets.networkFees.description",
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
    defaultSize: { w: 6, h: 6 },
    minSize: { w: 4, h: 5 },
    dataSources: ["ledger"],
    component: DcaWidget,
  },
  {
    id: "portfolioChart",
    titleKey: "dashboard.widgets.portfolioChart.title",
    descriptionKey: "dashboard.widgets.portfolioChart.description",
    defaultSize: { w: 8, h: 8 },
    minSize: { w: 4, h: 6 },
    dataSources: ["ledger", "priceHistory"],
    component: PortfolioChartWidget,
  },
  {
    id: "walletBreakdown",
    titleKey: "dashboard.widgets.walletBreakdown.title",
    descriptionKey: "dashboard.widgets.walletBreakdown.description",
    defaultSize: { w: 6, h: 6 },
    minSize: { w: 4, h: 4 },
    dataSources: ["ledger", "price"],
    component: WalletBreakdownWidget,
  },
  {
    id: "holdingComposition",
    titleKey: "dashboard.widgets.holdingComposition.title",
    descriptionKey: "dashboard.widgets.holdingComposition.description",
    defaultSize: { w: 6, h: 7 },
    minSize: { w: 4, h: 5 },
    dataSources: ["ledger"],
    component: HoldingCompositionWidget,
  },
  {
    id: "stackHistory",
    titleKey: "dashboard.widgets.stackHistory.title",
    descriptionKey: "dashboard.widgets.stackHistory.description",
    defaultSize: { w: 6, h: 7 },
    minSize: { w: 4, h: 5 },
    dataSources: ["ledger"],
    component: StackHistoryWidget,
  },
  {
    id: "buyHeatmap",
    titleKey: "dashboard.widgets.buyHeatmap.title",
    descriptionKey: "dashboard.widgets.buyHeatmap.description",
    // A year is 53 week columns at a readable cell size, so this one wants
    // width: at eight columns the strip fits without scrolling sideways.
    defaultSize: { w: 8, h: 6 },
    minSize: { w: 4, h: 5 },
    dataSources: ["ledger"],
    component: BuyHeatmapWidget,
  },
  {
    id: "feeBalance",
    titleKey: "dashboard.widgets.feeBalance.title",
    descriptionKey: "dashboard.widgets.feeBalance.description",
    defaultSize: { w: 4, h: 6 },
    minSize: { w: 3, h: 5 },
    maxSize: { w: 12, h: 8 },
    dataSources: ["ledger", "priceHistory"],
    component: FeeBalanceWidget,
  },
  {
    id: "whatIf",
    titleKey: "dashboard.widgets.whatIf.title",
    descriptionKey: "dashboard.widgets.whatIf.description",
    defaultSize: { w: 4, h: 6 },
    minSize: { w: 3, h: 5 },
    maxSize: { w: 12, h: 8 },
    dataSources: ["ledger", "price"],
    component: WhatIfWidget,
  },
  {
    id: "timeInMarket",
    titleKey: "dashboard.widgets.timeInMarket.title",
    descriptionKey: "dashboard.widgets.timeInMarket.description",
    defaultSize: { w: 4, h: 5 },
    minSize: { w: 3, h: 4 },
    maxSize: { w: 12, h: 7 },
    dataSources: ["ledger", "priceHistory"],
    component: TimeInMarketWidget,
  },
  {
    id: "blockClock",
    titleKey: "dashboard.widgets.blockClock.title",
    descriptionKey: "dashboard.widgets.blockClock.description",
    defaultSize: { w: 3, h: 5 },
    minSize: { w: 2, h: 4 },
    maxSize: { w: 12, h: 8 },
    dataSources: ["explorer"],
    component: BlockClockWidget,
  },
  {
    id: "utxoOverview",
    titleKey: "dashboard.widgets.utxoOverview.title",
    descriptionKey: "dashboard.widgets.utxoOverview.description",
    defaultSize: { w: 4, h: 6 },
    minSize: { w: 3, h: 5 },
    maxSize: { w: 12, h: 8 },
    dataSources: ["explorer", "price"],
    component: UtxoOverviewWidget,
  },
  {
    id: "milestones",
    titleKey: "dashboard.widgets.milestones.title",
    descriptionKey: "dashboard.widgets.milestones.description",
    defaultSize: { w: 4, h: 6 },
    minSize: { w: 3, h: 5 },
    maxSize: { w: 12, h: 8 },
    dataSources: ["ledger"],
    component: MilestonesWidget,
  },
  {
    id: "yearInReview",
    titleKey: "dashboard.widgets.yearInReview.title",
    descriptionKey: "dashboard.widgets.yearInReview.description",
    defaultSize: { w: 4, h: 6 },
    minSize: { w: 3, h: 5 },
    maxSize: { w: 12, h: 8 },
    dataSources: ["ledger"],
    component: YearInReviewWidget,
  },
  {
    id: "watchlistStatus",
    titleKey: "dashboard.widgets.watchlistStatus.title",
    descriptionKey: "dashboard.widgets.watchlistStatus.description",
    defaultSize: { w: 4, h: 6 },
    minSize: { w: 3, h: 5 },
    maxSize: { w: 12, h: 9 },
    dataSources: ["explorer"],
    component: WatchlistStatusWidget,
  },
];

/**
 * Tax widgets. Behind the same flag as every other tax surface (§4): with it
 * off they are not in the registry at all, so they cannot be placed, cannot be
 * picked, and a layout that still names one drops it on load like any unknown
 * widget.
 */
const TAX_WIDGETS: WidgetDefinition[] = [
  {
    id: "taxFreeProceeds",
    titleKey: "dashboard.widgets.taxFreeProceeds.title",
    descriptionKey: "dashboard.widgets.taxFreeProceeds.description",
    defaultSize: { w: 4, h: 6 },
    minSize: { w: 3, h: 5 },
    maxSize: { w: 12, h: 8 },
    dataSources: ["ledger", "price"],
    component: TaxFreeProceedsWidget,
  },
  {
    id: "exemptionLimit",
    titleKey: "dashboard.widgets.exemptionLimit.title",
    descriptionKey: "dashboard.widgets.exemptionLimit.description",
    defaultSize: { w: 4, h: 7 },
    minSize: { w: 3, h: 6 },
    maxSize: { w: 12, h: 9 },
    dataSources: ["ledger"],
    component: ExemptionLimitWidget,
  },
];

export const WIDGETS: WidgetDefinition[] = [
  ...BASE_WIDGETS,
  ...(TAX_FEATURES_ENABLED ? TAX_WIDGETS : []),
];

export const WIDGETS_BY_ID = new Map(WIDGETS.map((w) => [w.id, w]));

export const WIDGET_IDS = new Set(WIDGETS.map((w) => w.id));
