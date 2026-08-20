import type de from "./de";

const en: typeof de = {
  app: {
    name: "DepotWatch Orange",
    tagline: "Your Bitcoin portfolio. Your file. No server.",
  },
  common: {
    save: "Save",
    cancel: "Cancel",
    delete: "Delete",
    edit: "Edit",
    add: "Add",
    close: "Close",
    actions: "Actions",
    loading: "Loading …",
    error: "Error",
    confirmDelete: "Really delete?",
    none: "None",
    refresh: "Refresh",
    optional: "optional",
    unknown: "unknown",
    showMore: "Show {count} more",
    yes: "Yes",
    no: "No",
  },
  start: {
    openFile: "Open portfolio file",
    damagedTitle: "This file is damaged",
    damaged: {
      integrity:
        "The contents do not match the checksum stored in the file. It was changed after the last save, or damaged while being written or copied.",
      truncated:
        "The file stops in the middle of its contents. A save was probably interrupted, or the copy is incomplete.",
      unreadable:
        "The file could not be read. Either it is not a portfolio file, or its contents are destroyed.",
    },
    damagedAdvice:
      "It is therefore not opened automatically. Open a backup instead: backups are complete portfolio files and live in your backup folder.",
    damagedOpenBackup: "Open a backup file",
    damagedOpenAnyway: "Open anyway",
    createFile: "Create new portfolio",
    passwordTitle: "Enter password",
    passwordFor: "Password for {name}",
    newPasswordTitle: "Set a password for the new file",
    passwordPlaceholder: "Password",
    passwordRepeat: "Repeat password",
    passwordMismatch: "Passwords do not match.",
    noEncryption: "Continue without encryption (not recommended)",
    wrongPassword: "Wrong password or corrupted file.",
    invalidFile: "Could not read file (not a valid portfolio format).",
    unlock: "Unlock",
    create: "Create",
    localFirst:
      "All data stays in a single password-encrypted file on your device. No server, no account, no tracking.",
    howItWorks: "How it works",
    loadDemo: "Load demo portfolio",
    demoHint:
      "Loads sample data to try the app. Your edits are only saved to a file of your own once you save; the sample file itself is never changed.",
    demoLoadError: "Could not load the demo portfolio.",
    demoFileName: "Demo-Portfolio.dwp",
  },
  wizard: {
    title: "Create new portfolio",
    titleSaveExisting: "Save demo data",
    stepOf: "Step {current} of {total}",
    steps: {
      location: "Location",
      password: "Password",
      wallet: "First wallet",
      summary: "Summary",
    },
    locationIntroFsa:
      "Choose where your portfolio file should be stored. Changes will be written there automatically later.",
    locationIntroFallback:
      "Your browser does not support direct file access. The file will be saved as a download at the end of the wizard. Choose the file name here.",
    chooseLocation: "Choose location …",
    locationChosen: "Selected: {name}",
    fileNameLabel: "File name",
    passwordIntro:
      "The file is encrypted with this password (AES-256-GCM). Without the password nobody can recover the data, not even you.",
    strength: "Password strength",
    strengthWeak: "weak",
    strengthMedium: "medium",
    strengthStrong: "strong",
    walletIntro:
      "Create your first wallet with an account. It is needed for your first transaction (e.g. wallet “Exchange” with account “Spot”).",
    summaryIntro:
      "Please review your entries. “Create” will initialize and save the file.",
    summaryIntroExisting:
      "Please review your entries. Your existing demo data is carried over unchanged into the new file.",
    summaryLocation: "Location",
    summaryDownload: "Download ({name})",
    summaryEncryption: "Encryption",
    summaryEncrypted: "enabled (AES-256-GCM)",
    summaryUnencrypted: "disabled",
    summaryWallet: "Wallet",
    summaryAccount: "Account",
    summaryExistingData: "Data",
    summaryExistingDataValue: "{wallets} wallets, {transactions} transactions",
    back: "Back",
    next: "Next",
    create: "Create & save",
  },
  footer: {
    openSource: "Open Source",
    github: "Don't trust, verify on GitHub",
    help: "Help",
    imprint: "Legal Notice",
    privacy: "Privacy",
    genesisHeadline:
      "The Times 03/Jan/2009 Chancellor on brink of second bailout for banks",
    runningBitcoin: "Running bitcoin. (Hal Finney, 10 January 2009)",
  },
  howItWorks: {
    metaTitle: "How It Works | DepotWatch Orange",
    metaDescription:
      "How DepotWatch Orange works: local-first, one encrypted file, no server. The security architecture in detail.",
    title: "How it works",
    intro:
      "DepotWatch Orange is deliberately built differently from typical portfolio trackers. This page explains the architecture, with a focus on why your data is safe.",
    localFirstTitle: "Local-first: no server, no cloud, no account",
    localFirstBody:
      "All of your data (wallets, accounts, transactions, settings) lives in a single file on your own device. There is no server database, no sign-up, and no tracking. The app runs entirely in your browser: whatever you enter or import from CSV never leaves your machine. Nobody but you can see your holdings, not even us, because there simply is no place where they would be stored.",
    filesTitle: "Open & save: direct file access in the browser",
    filesBody:
      "In browsers with the File System Access API (e.g. Chrome, Edge) you pick your portfolio file once; from then on the app writes changes straight back to it after a short delay (autosave). In browsers without that API (e.g. Firefox, Safari) you open the file through an upload dialog and save changes as a download via the save button. Either way, the file only moves between your browser and your disk, never across the network.",
    encryptionTitle: "Encryption: your password, your key",
    encryptionBody:
      "Your file is encrypted with AES-256-GCM by default. The key is derived from your password with PBKDF2-SHA256 at 600,000 iterations, right in the browser via the WebCrypto API. The password itself is never stored; it only exists in memory for as long as the file is open.",
    encryptionWarning:
      "Important: there is no password reset. Since nothing sits on a server, nobody can send you a new password or decrypt the file, not even us. If you lose the password or the file, the data is gone for good. Keep both safe and back the file up regularly (it is encrypted, so storing it on a USB stick, for example, is perfectly fine).",
    watchlistTitle: "Watchlist: deliberately separate from the portfolio",
    watchlistBody:
      "The address watchlist (balances, UTXOs, privacy checks) is watch-only and kept apart from the portfolio ledger: watched addresses are never automatically part of your holdings, and your recorded transactions are never tied to on-chain lookups. There is a security and a privacy reason for that: live data from the timechain comes from a configurable explorer source (your own node if you prefer). With public APIs, the provider sees the addresses you query. Your ledger, in contrast, needs no network access at all. So you decide per address what gets queried, and your portfolio stays completely private even if you never use the watchlist.",
    openSourceTitle: "Open source: don't trust, verify",
    whitepaperBody:
      "The Bitcoin whitepaper ships with this app: nine pages, served from the project itself, with no request to anyone else.",
    whitepaperLink: "Bitcoin: A Peer-to-Peer Electronic Cash System (PDF)",
    openSourceBody:
      "You don't have to take our word for any of this. DepotWatch Orange is open source (MIT license). Anyone can check the code: whether nothing really is uploaded, how the encryption is implemented, and what else the app does.",
  },
  imprint: {
    metaTitle: "Legal Notice | DepotWatch Orange",
    title: "Legal Notice",
    placeholder:
      "Still incomplete: the postal address marked with square brackets has to be filled in before this site goes live. A legal notice without an address that can be served does not meet the requirement.",
    providerTitle:
      "Information pursuant to § 5 DDG (German Digital Services Act) and § 18 (1) MStV",
    providerBody:
      "Marcus Gerhardy\nAzaleenring 72\n49744 Geeste\nGermany",
    contactTitle: "Contact",
    contactBody:
      "Email: marcus.gerhardy@googlemail.com\n\nDepotWatch Orange is run privately and without any intention to make a profit. I answer enquiries by email; no telephone number is kept.",
    liabilityContentTitle: "Liability for content",
    liabilityContentBody:
      "As a service provider I am responsible for my own content on these pages under the general laws, pursuant to § 7 (1) DDG. Under §§ 8 to 10 DDG, however, I am not obliged as a service provider to monitor transmitted or stored third-party information, or to investigate circumstances that indicate unlawful activity. Obligations to remove or block the use of information under the general laws remain unaffected. Liability in this respect is only possible from the point in time at which a concrete infringement becomes known. Upon becoming aware of such infringements I will remove the content in question without delay.",
    liabilityLinksTitle: "Liability for links",
    liabilityLinksBody:
      "This site contains links to external websites of third parties, over whose content I have no influence. I can therefore accept no liability for that third-party content. The respective provider or operator of the linked pages is always responsible for their content. The linked pages were checked for possible legal violations at the time of linking; unlawful content was not recognisable at that time. Permanent monitoring of the content of linked pages is not reasonable without concrete indications of an infringement. Upon becoming aware of infringements I will remove such links without delay.",
    copyrightTitle: "Copyright",
    copyrightBody:
      "The content and works created by the site operator on these pages are subject to German copyright law. Reproduction, adaptation, distribution and any kind of exploitation outside the limits of copyright require the written consent of the respective author or creator. Downloads and copies of this page are permitted for private, non-commercial use only. Insofar as the content on this page was not created by the operator, the copyrights of third parties are respected and marked as such.",
  },
  privacyPolicy: {
    metaTitle: "Privacy | DepotWatch Orange",
    title: "Privacy Policy",
    controllerTitle: "Controller within the meaning of the GDPR",
    controllerBody:
      "Marcus Gerhardy\nAzaleenring 72\n49744 Geeste\nGermany\n\nEmail: marcus.gerhardy@googlemail.com\n\nNo data protection officer has been appointed; the conditions of Art. 37 GDPR and § 38 BDSG are not met.",
    noStorageTitle: "No user data is stored",
    noStorageBody:
      "DepotWatch Orange is a pure client application. All portfolio data lives exclusively in a local, password-encrypted file on your device. There is no server storing user data, no account and no tracking (no cookies, no analytics). Your portfolio data never leaves your device: it is transmitted neither to me nor to third parties, and I have no access to it at any time.",
    hostingTitle: "Hosting and server log files",
    hostingBody:
      "This site is hosted by Vercel Inc., USA (vercel.com). When the site is requested, the provider processes technically necessary access data in server log files: IP address, date and time of the request, the file requested, referrer, browser type and operating system. This processing is technically necessary to deliver the site and serves its secure and stable operation.\n\nThe legal basis is Art. 6 (1) (f) GDPR; the legitimate interest lies in the technically sound and secure operation of the site. A data processing agreement under Art. 28 GDPR is in place with the provider. Where personal data is transferred to the USA in this context, the transfer is based on an adequacy decision under Art. 45 GDPR (EU-US Data Privacy Framework) or on standard contractual clauses under Art. 46 (2) (c) GDPR.",
    externalTitle: "Requests to external services",
    externalIntro:
      "While the app is in use, data is fetched from external interfaces at runtime. For technical reasons the respective provider receives your IP address and the request data. The legal basis is Art. 6 (1) (f) GDPR: without these requests the app could show neither prices nor on-chain data.",
    externalBinance: "Binance (price data): no portfolio data is transmitted.",
    externalExplorer:
      "mempool.space / blockstream.info (on-chain data): the Bitcoin addresses you added to your watchlist are transmitted. Your own server can be configured instead in the settings.",
    externalOutro:
      "These requests only happen when you use the corresponding feature. The typefaces and the Bitcoin whitepaper are served by this site itself, so no CDN and no third-party font service is asked for anything.",
    rightsTitle: "Your rights",
    rightsBody:
      "You have the right to information (Art. 15 GDPR), rectification (Art. 16), erasure (Art. 17), restriction of processing (Art. 18), data portability (Art. 20) and to object to processing based on legitimate interests (Art. 21).\n\nIn practice I hold no data about you that any information could be given from: there is no account and no server-side storage. Your portfolio file is on your device and is yours alone; you delete it by deleting the file.\n\nIndependently of that you have the right to lodge a complaint with a supervisory authority (Art. 77 GDPR); for Lower Saxony: State Commissioner for Data Protection of Lower Saxony, Prinzenstrasse 5, 30159 Hanover, Germany.",
  },
  help: {
    metaTitle: "Help | DepotWatch Orange",
    title: "Help",
    path: "/help",
    intro:
      "How to use the app, sorted by topic. The security concept behind it is on \u201cHow it works\u201d; this is about the handling.",
    topics: "Topics",
    onThisPage: "On this page",
    searchLabel: "Search the help",
    searchPlaceholder: "Search …",
    results: "{count} results",
    noResults: "Nothing found for \u201c{query}\u201d.",
    about: "Help for this area",
    aboutLabel: "Help for: {what}",
    openFull: "Open as a page",
  },
  notFound: {
    title: "This page does not exist.",
    body:
      "The link is probably out of date or mistyped. Your portfolio file is unaffected: it lives on your device, not here.",
    home: "Open the app",
  },
  nav: {
    dashboard: "Dashboard",
    transactions: "Transactions",
    pointInTime: "As of date",
    tax: "Tax",
    watchlist: "Watchlist",
    milestones: "Milestones",
    settings: "Settings",
    menu: "Menu",
    privacyMode: "Privacy mode (hide amounts)",
    saveFile: "Save file",
    unsavedChanges: "Unsaved changes",
    saved: "Saved",
    lastSavedAt: "Last saved: {time}",
    notYetSaved: "Not saved yet",
    encrypted: "Encrypted (AES-256-GCM)",
    unencrypted: "Unencrypted",
    closeFile: "Close file",
    closeFileConfirm:
      "Close file? Unsaved changes will be lost (in automatic mode everything is already saved).",
    closeFileConfirmDemo:
      "Close file? This demo data has never been saved. All changes will be lost.",
    setUpFile: "Save demo data",
  },
  dashboard: {
    holdings: "Holdings",
    price: "BTC price",
    priceUnavailable: "Price unavailable",
    realizedPnl: "Realized P/L",
    avgCost: "Avg. cost basis",
    costBasis: "Cost basis",
    wallet: "Wallet",
    account: "Account",
    chartPortfolio: "Portfolio value",
    chartBtcPrice: "BTC price",
    uncoveredHint:
      "{amount} of your sells, spends, or outgoing transfers have no matching purchase in the portfolio (e.g. a CSV export that starts mid-history). The holding above is correct, but cost basis, average cost, and unrealized P/L are incomplete.",
    breakdownIntro:
      "Every line already carries the BTC fees of its transactions: a buy counts amount minus fee, while sell, spend and outgoing transfer count amount plus fee (see the fee convention). A transfer between your own accounts therefore costs exactly the network fee.",
    breakdownBuys: "Buys",
    breakdownTransferIns: "Transfers in",
    breakdownSells: "Sells",
    breakdownTransferOuts: "Transfers out",
    breakdownSpends: "Spends",
    breakdownFees: "of which BTC fees",
    breakdownTotal: "Holding",
    invalidAmountHint:
      "{count} transaction(s) have an amount or BTC fee that is not a number. Such values count as 0 and distort the holding.",
    negativeBalanceHint:
      "The total holding is negative: more sells, spends, and outgoing transfers are recorded than buys and incoming transfers. Please check the transactions.",
    chartCompare: "Compare with BTC price",
    chartEmpty: "No transactions yet. Your value history will appear here.",
    showTransactions: "Show this account's transactions",
    range90: "90 d",
    range365: "1 y",
    rangeAll: "All",
    widgets: {
      pickerTitle: "Add widget",
      pickerIntro:
        "Pick a widget for the free slot. The tags show where a widget gets its data from.",
      alreadyPlaced: "already placed",
      addWidget: "Widget",
      addHere: "Add a widget here",
      remove: "Remove widget",
      crashed: "This widget could not be rendered.",
      resetLayout: "Reset layout",
      resetConfirm:
        "Reset the layout to the default dashboard? Your arrangement will be lost.",
      doneEditing: "Done",
      editHint:
        "Turn on editing to move, resize, add or remove widgets.",
      emptyDashboard: "Your dashboard is empty.",
      sources: {
        ledger: "local only",
        price: "price (Binance)",
        priceHistory: "price history (Binance)",
        explorer: "explorer",
      },
      change24h: "24 h",
      change7d: "7 days",
      change30d: "30 days",
      unrealizedAgainstCost: "unrealized against cost basis",
      pnlCoveredBtc: "Of which valued",
      pnlWithoutBasisHint:
        "{amount} of your holding have no cost basis, for example receives from outside without a price. That amount is part of neither the cost basis nor the gain, because its full market value would otherwise show up as profit.",
      // --- New widgets ----------------------------------------------------
      taxFreeEmpty: "No open lots.",
      taxFreeProceedsLabel: "Tax-free realisable (at the current price)",
      taxFreeShare: "Share of the holding past the holding period",
      taxFreeAmount: "Amount ({unit})",
      taxFreeLots: "Lots affected",
      taxFreeLocked: "Still inside the holding period ({unit})",
      taxFreeUnresolved: "Not assessable, origin unresolved ({count})",
      taxDisclaimer:
        "An estimate based on the configured settings. It does not replace tax advice.",
      exemptionRealized: "Realised taxable gains {year}",
      exemptionLimitLabel: "Exemption limit",
      exemptionHeadroom: "Headroom left",
      exemptionOver: "Exceeded by",
      exemptionDisposals: "Disposals this year",
      exemptionTaxFreeGain: "Of which tax-free (past the holding period)",
      exemptionUnresolved: "BTC with unresolved origin",
      exemptionIsLimitNotAllowance:
        "This is a limit, not an allowance: exceed it by a single euro and the entire gain is taxable, not just the part above it.",
      exemptionAsOf: "As of {date}",
      stackHistoryEmpty: "No transactions yet.",
      stackSince: "Holding since {date}",
      stackAmount: "Holding",
      heatmapSummary: "Over the last 12 months, {count} buys",
      heatmapCell: "one square = one day",
      heatmapEmpty: "No buys in the last 12 months.",
      heatmapLess: "less",
      heatmapMore: "more",
      heatmapFooter: "Bought on {days} days, {amount} in total",
      heatmapBuys: "· {count} buy(s)",
      heatmapNoBuy: "· no buy",
      heatmapPerBtc: " per BTC",
      feesEmpty: "No transactions yet.",
      feesPaid: "Total fees paid",
      feesOfInvested: "of the amount invested",
      feesTrading: "Trading fees",
      feesNetwork: "Network fees",
      feesBtc: "Of which paid in BTC",
      feesInvested: "Amount invested",
      feesUnvalued: "{amount} of fees have no daily close, so they are left out of the total.",
      feesNoHistory: "Price history unavailable, so BTC fees stay unvalued.",
      whatIfEmpty: "No positions with a known cost basis.",
      whatIfValue: "Portfolio value at this price",
      whatIfMultiple: "{multiple}× the current price",
      whatIfPrice: "Hypothetical BTC price",
      whatIfPnl: "Profit/loss against cost basis",
      whatIfValued: "Of which valued",
      whatIfReset: "current price",
      blockEpoch: "Epoch {epoch} · {blocks} blocks",
      blockAsOf: "As of {time}",
      watchlistEmpty: "No watched addresses yet.",
      utxoCountLabel: "UTXOs across {addresses} addresses",
      utxoTotal: "Total value",
      utxoDust: "Dust UTXOs",
      utxoConsolidatable: "Consolidatable (< 0.001 BTC)",
      utxoConsolidationCost: "Cost of one consolidation",
      utxoConsolidateNow:
        "Fees are low: a good moment to fold those {count} small UTXOs into one.",
      utxoConsolidateWait:
        "Fees are elevated. Better to wait for cheaper blocks before consolidating.",
      toWatchlist: "To the watchlist",
      watchlistFindings: "Open warnings across {addresses} addresses",
      watchlistClean: "Nothing conspicuous found.",
      watchlistScore: "Avg. privacy score",
      watchlistSkipped: "Not queryable (xpub)",
      finding: {
        addressReuse: "Address reuse",
        pubkeyLeaked: "Public key exposed",
        legacyFormat: "Legacy address format",
        possiblePoisoning: "Suspected address poisoning",
        dustUtxo: "Dust UTXOs",
        roundAmounts: "Conspicuously round amounts",
      },
      timeInMarketEmpty: "No buy recorded yet.",
      daysInMarket: "Days in the market",
      yearsInMarket: "{years} years",
      firstBuy: "First buy",
      buysPerYear: "Buys per year",
      maxDrawdown: "Maximum drawdown",
      drawdownDetail: "From {peak} to {trough} on {date}",
      markerBucket: {
        week: "Markers grouped by week ({count} trades in the period)",
        month: "Markers grouped by month ({count} trades in the period)",
      },
      markerWithoutPrice: "{count} trade(s) without a recorded price, not on the chart",
      markerOutsideHistory: "{count} trade(s) from before the available price history",
      markerTipTrades: "Trades",
      markerTipAmount: "Amount",
      markerTipValue: "Value",
      markerTipAvgPrice: "Avg. price",
      markerTipPeriod: "{from} to {to}",
      spotPriceSource: "Spot price (Binance)",
      moscowTime: "Moscow time",
      moscowTimeSats: "{sats} sats per dollar",
      moscowTimeHint:
        "Moscow time: how many sats one US dollar buys, read as a clock (2,000 sats = 20:00). Just another way of writing the price, always in dollars by convention.",
      sats: "Sats held",
      nextMilestone: "Next milestone",
      satsToGo: "{amount} sats to go",
      wholecoinerReached: "Wholecoiner reached",
      ofOneBtc: "{percent} of a whole bitcoin",
      milestone001: "0.01 BTC",
      milestone01: "0.1 BTC",
      milestone05: "0.5 BTC",
      milestoneWholecoiner: "1 BTC (wholecoiner)",
      avgCostUnknown:
        "Without a cost basis or a current price the distance cannot be computed.",
      distance: "Distance",
      oneBtc: "1 BTC = 1 BTC",
      pizzaDay: "Bitcoin Pizza Day: {pizzas} pizzas at the 2010 rate (10,000 BTC for two)",
      sovereignBadge: "Not your keys, not your coins. But these are yours.",
      sovereignHint: "None of the holding sits on an exchange.",
      feeMood: {
        veryLow: "Very cheap blocks: a good moment to consolidate UTXOs.",
        low: "Cheap. Larger transactions cost little right now.",
        normal: "Normal load.",
        high: "Elevated fees: anything that can wait, should.",
        veryHigh: "Very expensive blocks. If it is not urgent, send later.",
      },
      onExchanges: "on exchanges",
      selfCustody: "Self custody",
      exchangeWarning:
        "Bitcoin on an exchange is only a claim against that exchange. For long-term holdings, self custody is safer.",
      backupOk: "Backup verified: {when}",
      backupUnverified: "Backup from {when} not verified",
      backupNever: "No verified backup yet",
      yearInReviewEmpty: "No completed year in the ledger yet.",
      yearInReviewStacked: "Net stacked in {year}",
      custodyEmpty: "No holdings yet.",
      taxFreeNow: "Tax-free right now",
      allTaxFree: "The entire holding is tax-free.",
      taxFreeFrom: "Tax-free from",
      daysLeft: "Days",
      holdingPeriodUnresolved:
        "{amount} without a traceable origin: no holding period can be determined for them.",
      holdingPeriodEmpty: "No open lots.",
      dataQualityClean: "No open issues found.",
      showAffected: "Show the affected transactions",
      issues: {
        unlinkedTransfer: "Transfers without a counterpart",
        unresolvedOrigin: "Arrivals with unresolved origin",
        incompleteAllocation: "Sells, spends and transfers with incomplete lot assignment",
        missingTxid: "Transfers without a txid",
        missingEurValue: "Transactions without a EUR value",
      },
      entries: "Buys",
      exits: "Sells",
      dcaEmpty: "No buys recorded yet.",
      avgPerMonth: "Average per month",
      buyCount: "Buys",
      avgInterval: "Rhythm",
      everyNDays: "every {days} days",
      totalInvested: "Invested",
      cumulativeBtc: "Cumulative",
      explorerUnavailable: "The explorer source ({endpoint}) cannot be reached.",
      feeFastest: "Next block",
      feeHalfHour: "Half an hour",
      feeHour: "One hour",
      feeEconomy: "Economy",
      daysValue: "{days} days",
      untilHalving: "until the next halving",
      blockHeight: "Block height",
      blocksToGo: "Blocks to go",
      halvingBlock: "Halving at block",
      halvingEstimateHint:
        "Estimated from ten minutes per block. The real duration depends on the hash rate.",
      savingsGoal: {
        title: "Savings goal",
        description: "Progress towards your savings target, without a verdict.",
      },
      yearInReview: {
        title: "Year in review",
        description: "The last completed year in a few figures.",
      },
      milestones: {
        title: "Milestones",
        description: "The milestones reached most recently, and the overall count.",
      },
      taxFreeProceeds: {
        title: "Tax-free realisable",
        description: "What is past the holding period, valued at the current price.",
      },
      exemptionLimit: {
        title: "Exemption limit tracker",
        description:
          "This year's realised gains against the limit configured in the settings.",
      },
      stackHistory: {
        title: "Stack over time",
        description: "The BTC amount itself over time, independent of the price.",
      },
      buyHeatmap: {
        title: "Buy heatmap",
        description: "Twelve months of buys as a calendar, shaded by volume.",
      },
      feeBalance: {
        title: "Fee balance",
        description: "Every fee paid, in EUR, split into trading and network.",
      },
      whatIf: {
        title: "What if",
        description: "Portfolio value and gain at a price you choose yourself.",
      },
      timeInMarket: {
        title: "Time in the market",
        description: "Days since the first buy, and the deepest fall since then.",
      },
      blockClock: {
        title: "Block clock",
        description: "The current block height, large and unadorned.",
      },
      utxoOverview: {
        title: "UTXO overview",
        description: "Watchlist UTXOs, dust, and what consolidating would cost.",
      },
      watchlistStatus: {
        title: "Watchlist status",
        description: "Watched addresses and the security warnings still open.",
      },
      portfolioValue: {
        title: "Portfolio value",
        description:
          "Total value in the display currency, with the change over 24 hours, 7 and 30 days.",
      },
      pnl: {
        title: "Profit / loss",
        description: "Unrealized against cost basis, realized gains separately.",
      },
      btcPrice: {
        title: "BTC price",
        description: "Spot price from Binance in EUR and USD, plus Moscow time.",
      },
      holdingPeriod: {
        title: "Holding period",
        description:
          "Which lots are tax-free, when the others follow, and how much BTC is tax-free right now.",
      },
      satsStack: {
        title: "Sats stack",
        description: "Holding in sats with progress towards the next milestone.",
      },
      avgCost: {
        title: "Cost basis",
        description:
          "Average cost basis against the current price, with the distance visualized.",
      },
      custody: {
        title: "Custody",
        description:
          "Share held on exchanges versus self custody, the exchange share as a warning metric.",
      },
      priceEntries: {
        title: "Price with your entries and exits",
        description:
          "BTC price history with your own buys and sells drawn in as markers.",
      },
      networkFees: {
        title: "Network fees",
        description:
          "Current fee rates in sat/vB via the configured explorer source.",
      },
      halving: {
        title: "Halving countdown",
        description:
          "Block height, remaining blocks and the estimated days until the next halving.",
      },
      dataQuality: {
        title: "Data quality",
        description:
          "Open issues in your ledger, each jumping into the filtered transaction table.",
      },
      dca: {
        title: "DCA overview",
        description:
          "Buying rhythm, average amount per month and the cumulative stack over time.",
      },
      portfolioChart: {
        title: "Value over time",
        description:
          "How the portfolio value developed, optionally compared with the BTC price.",
      },
      walletBreakdown: {
        title: "Wallets and accounts",
        description: "Balance per wallet account; a click opens its transactions.",
      },
      holdingComposition: {
        title: "How the holding is made up",
        description:
          "Which buys, sells, transfers and fees the current holding results from.",
      },
    },
  },
  wallets: {
    title: "Wallets & accounts",
    addWallet: "Add wallet",
    addAccount: "Add account",
    walletName: "Wallet name",
    walletNamePlaceholder: "Exchange",
    accountName: "Account name",
    firstAccountName: "First account",
    firstAccountDefault: "Account 1",
    firstAccountHint:
      "A wallet holds nothing on its own: transactions always hang on an account. Without one, this wallet cannot be picked anywhere.",
    noAccounts: "Without an account this wallet cannot be picked anywhere.",
    type: "Type",
    types: {
      exchange: "Exchange",
      hardware: "Hardware wallet",
      software: "Software wallet",
      paper: "Paper wallet",
    },
    rename: "Rename",
    deleteWalletConfirm:
      "Delete wallet “{name}” including all accounts and transactions?",
    deleteAccountConfirm:
      "Delete account “{name}” including all transactions?",
    empty: "No wallets yet. Create a wallet with an account first.",
  },
  celebration: {
    buyTitle: "Stacked.",
    wholecoinerTitle: "One whole coin.",
    wholecoinerBody: "Your holding has reached 1.00000000 BTC.",
  },
  easterEggs: {
    laserEyesUnlocked: "Laser eyes unlocked. You can switch them off in the settings.",
  },
  milestones: {
    title: "Milestones",
    intro:
      "Milestones record decisions you made: stacked, self-custodied, held, kept in order. Never the price, because a rising price is not an achievement, it is weather. There are no streaks to lose and no comparison with anyone else, because this app has never seen anyone else.",
    reached: "Milestone reached",
    andMore: "and {count} more",
    open: "open",
    overall: "Reached in total",
    showAll: "All milestones",
    widgetEmpty: "No milestones reached yet.",
    daysProgress: "{current} of {target} days",
    categories: {
      stacking: "Stacking",
      sovereignty: "Sovereignty",
      patience: "Patience",
      diligence: "Diligence",
      culture: "Culture",
    },
    catalog: {
      firstTransaction: {
        title: "The beginning",
        description:
          "The first transaction is recorded.",
      },
      sats100k: {
        title: "100,000 sats",
        description:
          "A ten-thousandth of a bitcoin held.",
      },
      sats1m: {
        title: "1,000,000 sats",
        description:
          "A million sats, the first round number for many.",
      },
      btc010: {
        title: "0.1 BTC",
        description:
          "A tenth of a bitcoin held.",
      },
      btc021: {
        title: "0.21 BTC",
        description:
          "One per cent of 21, the number everything turns on.",
      },
      btc1: {
        title: "Wholecoiner",
        description:
          "A whole bitcoin held.",
      },
      btc21: {
        title: "2.1 BTC",
        description:
          "Ten per cent of 21.",
      },
      firstWithdrawal: {
        title: "Off the exchange",
        description:
          "Bitcoin moved from an exchange into your own wallet for the first time.",
      },
      selfCustody50: {
        title: "Half in your own hands",
        description:
          "At least 50 % of the holding is in self custody.",
      },
      selfCustody100: {
        title: "Fully self-custodied",
        description:
          "None of the holding sits on an exchange any more.",
      },
      firstWatchedAddress: {
        title: "First watched address",
        description:
          "An address added to the watchlist.",
      },
      taprootAddress: {
        title: "Taproot",
        description:
          "A taproot address (bc1p…) recorded.",
      },
      lightningWallet: {
        title: "Lightning",
        description:
          "A Lightning wallet created.",
      },
      firstTaxFreeLot: {
        title: "First lot past the year",
        description:
          "A lot has passed the one-year holding period.",
      },
      days100: {
        title: "100 days in",
        description:
          "100 days since the first buy.",
      },
      year1: {
        title: "A year in",
        description:
          "A year since the first buy.",
      },
      throughHalving: {
        title: "Held through a halving",
        description:
          "Coins held across a halving.",
      },
      years4: {
        title: "A full cycle",
        description:
          "Four years since the first buy.",
      },
      firstBackup: {
        title: "First backup",
        description:
          "The portfolio exists as a file on disk.",
      },
      encrypted: {
        title: "Encrypted",
        description:
          "The portfolio file is encrypted with a password.",
      },
      allTransfersLinked: {
        title: "Every transfer linked",
        description:
          "Every transfer has its counterpart, no loose ends.",
      },
      allTxidsRecorded: {
        title: "Every txid recorded",
        description:
          "Every transfer transaction carries its on-chain id.",
      },
      taxExported: {
        title: "Tax report exported",
        description:
          "A yearly report generated as a file.",
      },
      taxYearClosed: {
        title: "Tax year closed",
        description:
          "A year that is over is fully assigned.",
      },
      whitepaperOpened: {
        title: "Whitepaper read",
        description:
          "Opened the nine pages that started all of this.",
      },
      firstConsolidation: {
        title: "Tidied up",
        description:
          "Several lots folded into one transaction.",
      },
      boughtOnHalvingDay: {
        title: "Bought at a halving",
        description:
          "Added on a halving day.",
      },
      boughtOnPizzaDay: {
        title: "Pizza day",
        description:
          "Bought on 22 May, the day of the two most expensive pizzas in history.",
      },
    },
  },
  yearInReview: {
    title: "Year in review",
    intro:
      "What you did in a year: bought, held, moved into your own custody, paid in fees. No verdict on your prices: what the market did was never your decision.",
    open: "Open the year in review",
    noYears: {
      title: "No year to look back on yet.",
      body:
        "A review exists once a year is over. {year} is still running, so any figure about it would only be an interim note.",
    },
    yearLabel: "Year",
    step: "{current} of {total}",
    next: "Next",
    back: "Back",
    empty: {
      title: "Nothing happened here in {year}.",
      body:
        "No transactions are recorded for this year. Pick another year above; past years stay available at any time.",
    },
    summary: {
      label: "Everything at a glance",
      sentence: "{count} transactions this year. Every figure leads back to its card.",
    },
    market: {
      missing:
        "Comparing against the yearly average needs historical prices. They are only loaded when you ask for them.",
      load: "Load price data",
      loading: "Loading …",
      error: "Price data could not be loaded.",
    },
    cards: {
      stacked: {
        label: "Net stacked",
        sentence: "Your holding grew by this much over the year, out of {buys} buys. Transfers between your own wallets are netted out.",
        sentenceNoBuys: "That is how much your holding changed on balance this year. Transfers between your own wallets are netted out.",
        buys: "Buys",
        inSats: "In sats",
        growth: "Change since the start of the year",
      },
      invested: {
        label: "Invested",
        sentence: "That is what {buys} buys added up to, trading fees included.",
        perBuy: "Average per buy",
        withoutEur: "Buys without a EUR figure",
      },
      avgPrice: {
        label: "Your average price",
        sentenceBelow: "Volume-weighted across your buys. That is {percent} below the year's average price.",
        sentenceAbove: "Volume-weighted across your buys. That is {percent} above the year's average price.",
        sentenceNoMarket: "Volume-weighted across your buys: the price you actually paid on average.",
        market: "BTC yearly average",
        marketDays: "Days with price data",
      },
      priceRange: {
        label: "Price range paid",
        sentence: "Your {buys} buys of the year sat between these two prices.",
        spread: "Spread",
      },
      rhythm: {
        label: "Busiest month",
        sentence: "You bought {buys} times in this month. Your most frequent weekday was {weekday}.",
        monthAmount: "Amount in this month",
        weekdayBuys: "Buys on this weekday",
      },
      streak: {
        label: "Longest buying streak",
        value: {
          weeks: "{count} weeks",
          months: "{count} months",
        },
        sentence: "That is how long you kept buying without a gap this year.",
      },
      fees: {
        label: "Fees paid",
        sentence: "Trading and network fees together, {percent} of what you invested.",
        sentenceNoShare: "This year's trading and network fees together.",
        trading: "Trading fees",
        network: "Network fees",
        unvalued: "BTC fees without a daily close",
      },
      taxFree: {
        label: "Holding period passed",
        sentence: "This amount, from {lots} positions, passed the one-year mark this year and is still held.",
        unresolved: "Origin unresolved (not judgeable)",
        disclaimer:
          "Origin and holding period come from the assigned original buys. Positions without a resolved origin are not included here. Not tax advice.",
      },
      realized: {
        label: "Realised",
        sentence: "From {count} sells or spends this year.",
        taxable: "of which taxable",
        taxFree: "of which tax-free",
        unresolved: "Origin unresolved (not judgeable)",
        disclaimer:
          "Gains under FIFO, over the assigned original buys. Not tax advice.",
      },
      custody: {
        label: "In self custody",
        sentence: "Share of your holding at year end that was not on an exchange. {count} transfers went from an exchange into your own wallet this year.",
        moved: "Moved in those",
      },
      milestones: {
        label: "Milestones reached",
        sentence: "Added over this year.",
      },
      closing: {
        label: "Holding at year end",
        sentence: "Where things stood after the last day of {year}.",
        inSats: "In sats",
        start: "At the start of the year",
      },
    },
    share: {
      title: "Share as an image",
      localOnly:
        "The image is created entirely in your browser. Nothing is uploaded; no server and no external service is involved.",
      absolute: "Show absolute amounts",
      absoluteHint:
        "{count} figures stating absolute amounts are hidden. Only relative figures are shared: counts, percentages, average price.",
      absoluteWarning:
        "Careful: the image now names the actual size of your holding and your amounts. Anyone who sees it knows how much bitcoin you own. That is a personal security risk, not just a privacy question.",
      privacyBlocked:
        "Privacy mode is on. While it is, no absolute amounts can be written into an image.",
      preview: "This is what the image says:",
      download: "Save as PNG",
      fileName: "year-in-review-{year}.png",
      imageTitle: "Year in review {year}",
      imageFooter: "Created locally · DepotWatch Orange",
      buys: "Buys",
      growth: "Change in holding",
      stacked: "Net stacked",
      invested: "Invested",
      avgPrice: "Your average price",
      vsMarket: "Against the yearly average",
      priceRange: "Price range paid",
      busiestMonth: "Busiest month",
      busiestWeekday: "Most frequent weekday",
      streak: {
        weeks: "Longest streak (weeks)",
        months: "Longest streak (months)",
      },
      feeShare: "Fee share",
      fees: "Fees",
      taxFree: "Holding period passed",
      realized: "Realised",
      custody: "In self custody",
      milestones: "Milestones",
      closing: "Holding at year end",
    },
    hint: {
      body: "Your year in review for {year} is ready.",
      open: "Open the {year} review",
      dismiss: "Dismiss",
    },
  },
  tx: {
    title: "Transactions",
    titleCount: "{filtered} of {total}",
    add: "Add transaction",
    edit: "Edit transaction",
    date: "Date",
    time: "Time",
    type: "Type",
    typeGroupNoTrade: "Not a trade",
    inheritedDate: "Giver's acquisition",
    inheritedCost: "Giver's acquisition cost (EUR)",
    inheritedIntro:
      "With a gift you step into the giver's shoes: the holding period counts from their acquisition, not from the day the coins reached you, and their acquisition cost becomes yours.",
    inheritedUnknown:
      "Without the giver's acquisition date the holding period cannot be determined. The app does not fall back to the date of receipt: the position is reported as unresolved.",
    inheritedUnknownShort: "Acquisition unknown",
    types: {
      buy: "Buy",
      sell: "Sell",
      transfer_in: "Transfer (in)",
      transfer_out: "Transfer (out)",
      transfer: "Transfer",
      spend: "Spend",
      gift_in: "Gift received",
      gift_out: "Gift given",
      income: "Income (received)",
    },
    wallet: "Wallet",
    account: "Account",
    fromAccount: "From account",
    toAccount: "To account",
    externalTransfer: "External wallet (not in portfolio)",
    counterpartyLinked:
      "Determined by the linked counterpart. To change it, release the link on the incoming transaction.",
    amountBtc: "Amount (BTC)",
    priceEur: "Price (EUR/BTC)",
    totalEur: "Total (EUR)",
    feeBtc: "Fee (BTC)",
    feeEur: "Fee (EUR)",
    valueEur: "Value (EUR)",
    valueFromOrigin:
      "The sum of the buys' EUR amounts behind this transaction, in proportion to its share. A transfer has no price of its own; the rate is value ÷ amount.",
    valueFromOriginPartial:
      "The sum of the buys' EUR amounts behind this transaction, but only for the part of the amount that has one. The real value is higher.",
    valueFromTransfer:
      "Recorded when the transfer was created: the sum of the EUR amounts of the buys it moves.",
    originalSection: "Settled in another currency",
    originalHint:
      "Documentation only, e.g. a BTC buy against USDT. Calculations and tax figures always use the EUR value at the time of the transaction.",
    originalCurrency: "Original currency",
    originalCurrencyPlaceholder: "e.g. USDT",
    originalAmount: "Amount (original currency)",
    originalPrice: "Price per BTC (original currency)",
    eurValuationRun: "Derive EUR value from historical price",
    eurValuationDerived:
      "EUR value derived automatically from the historical Binance price",
    eurValuationNeedsAmount: "This needs a date and an amount.",
    eurValuationUnavailable: "No price available for that point in time.",
    note: "Note",
    onChainSection: "On-chain data (optional)",
    onChainHint:
      "Used to match an outgoing transfer with its incoming counterpart between your wallets. Informational only: the security and privacy checks keep working exclusively on the address watchlist.",
    txid: "Transaction ID (txid)",
    txidPlaceholder: "64 hex characters, e.g. 4a5e1e4b…deda33b",
    txidInvalid: "Invalid transaction ID: exactly 64 hex characters (0-9, a-f) expected.",
    address: "Bitcoin address",
    addressPlaceholder: "bc1… / 1… / 3…",
    addressHint:
      "Destination address for an outgoing transfer, receiving address for an incoming one. It pins down which output of the transaction is meant.",
    addressInvalid:
      "Invalid Bitcoin address (allowed: legacy 1…/3…, bech32 bc1q…, bech32m bc1p…).",
    onChainInherited: "Taken from the linked counterpart transaction",
    onChainAdopt: "Adopt",
    copyValue: "Copy to clipboard",
    copied: "Copied",
    openInExplorer: "Open in block explorer",
    deleteTitle: "Delete transaction",
    deleteConfirm: "Really delete this transaction?",
    bulkDeleteConfirm: "Really delete {count} selected transactions?",
    deleteReleasesLegs:
      "{count} linked transfer entr(ies) lose their counterpart and become external transfers.",
    deleteClearsAllocations:
      "{count} transaction(s) have their lot allocation released; they will fall back to the oldest available lots (FIFO).",
    filterAll: "All",
    filterIssue: "Data quality",
    filterFrom: "From",
    filterTo: "To",
    onlyTaxFree: "Show only tax-free positions",
    sellLotAction: "Sell",
    sellLotTitle: "Sell lot",
    lotMax: "Remaining in this lot: {max} BTC",
    lotExceeds: "Amount exceeds the lot's remaining balance ({max} BTC).",
    rowsPerPage: "Rows per page",
    allRows: "All",
    taxStatus: "Tax status",
    columns: "Columns",
    timeAt: "{time}",
    selectAll: "Select all",
    selectRow: "Select row",
    selectedCount: "{count} selected",
    clearSelection: "Clear selection",
    changeWalletAccount: "Change wallet/account",
    moveConfirm: "{count} transaction(s) will be moved to “{target}”.",
    moveTransferNote:
      "The selection contains internal transfers: the counterpart leg stays in its account and is automatically re-linked to the new account.",
    moveTransferConflict:
      "Not possible: {count} transfer(s) would end up with both legs in the same account. Please adjust the target account or the selection.",
    moveLegacyTransferWarning:
      "{count} older transfer transaction(s) without a group link: the counterpart cannot be updated automatically. Please review it manually afterwards.",
    moveAction: "Move",
    transferAction: "Transfer to …",
    transferSubmit: "Transfer",
    transferIntro:
      "Bundles the selected open buy/transfer-in lots into one real transfer to another wallet/account. Unlike \"Change wallet/account\", this creates a transfer_out with lot allocations and a linked transfer_in. The lots' original acquisition data and cost basis are preserved for the holding-period/FIFO calculation.",
    transferAssignIntro:
      "Assign the buys this arrival came from. Picking the source account and its lots creates the linked outgoing leg, after which the holding period runs from the original purchase date.",
    transferAssignSource: "Source account",
    transferAssignSourcePick: "Choose account …",
    transferAssignPickLot: "Select the lot from {date}",
    transferAssignNoLots: "This account has no open lots.",
    transferIneligible:
      "{count} selected transaction(s) are not a buy/transfer-in with a remaining balance and will be ignored.",
    transferMultiSource:
      "The selected lots are spread across several different accounts. Please select lots from a single source account only.",
    transferRemaining: "Remaining",
    transferAmount: "To transfer",
    transferFeeBtc: "Network fee (optional)",
    transferFeeOnTopHint:
      "The fee is charged on top of the amount: the source account loses amount + fee, the target receives the amount.",
    transferSameAccount: "The target account must differ from the source account.",
    transferSummaryLots: "Number of lots",
    transferSummarySource: "Source",
    transferSummaryTarget: "Target",
    transferSummaryTotal: "Sum of the lots (BTC, leaves the account)",
    transferSummaryNet: "Amount of the transfer entry (BTC, without fee)",
    transferSummaryAvgCost: "Ø cost basis (quantity-weighted)",
    transferSummaryCostBasis: "Total cost basis",
    transferSummaryUnknownBasisNote:
      "No cost basis is known for part of this amount (e.g. externally received lots), that portion is excluded from the values above.",
    transferDate: "Transfer date",
    transferOutSectionTitle: "Outgoing transaction (source: {source})",
    transferOutModeNew: "Create new outgoing transaction",
    transferOutModeExisting: "Link to an existing transaction",
    transferInSectionTitle: "Incoming transaction (target: {target})",
    transferInModeNew: "Create new incoming transaction",
    transferInModeExisting: "Link to an existing transaction",
    transferCandidateNone: "No matching candidates found in this account.",
    transferBestMatch: "most likely match",
    transferMismatchOut:
      "The selected outgoing transaction is {actual} BTC, but {expected} BTC is expected. The assigned lots add up to {lots} BTC minus the {fee} BTC network fee.",
    transferMismatchIn:
      "The selected incoming transaction is {actual} BTC, but {expected} BTC (total minus fee) was expected.",
    transferMismatchConfirm: "I confirm linking these despite the amount mismatch.",
    pageOf: "Page {current} of {total}",
    prevPage: "Previous page",
    nextPage: "Next page",
    empty: "No transactions found.",
    emptyLedger: "No transactions recorded yet.",
    emptyLedgerEgg: "Nothing here yet. Every stack starts at zero sats.",
    amountColumn: "Amount ({unit})",
    feeColumn: "Fee ({unit})",
    resetFilters: "Reset filters",
    amountRequired: "Amount must be greater than 0.",
    priceRequired: "Price or total (EUR) is required for buy/sell/spend.",
    accountRequired: "Please create a wallet with an account first.",
    sameAccount: "Source and target account must differ.",
    transferredAway: "transferred",
    transferredTarget: "Target",
    transferredDate: "Date",
    transferredAmount: "Amount",
    transferredJump: "Go to transaction",
    section: {
      inherited: "Where the gift came from",
      fees: "Fees",
      origin: "Origin & assignment",
    },
    lotPicker: {
      search: "Search",
      searchPlaceholder: "date, note, amount …",
      planned: "Will be assigned",
      noMatch: "No lot matches these filters.",
      needOnly: "Only distribute the remaining {amount} BTC",
      needOnlyHint:
        "The selection is filled up in the table's order; without this, every picked lot is assigned in full.",
      selectedSummary: "{count} selected · {amount} BTC",
      confirm: "Assign",
    },
    allocations: {
      section: "Assigned buys",
      intro:
        "The buys this transfer closes. Their sum has to match the amount plus the network fee, because that is what left the account.",
      acquired: "Purchase date",
      source: "Source account",
      amount: "Assigned",
      price: "Cost / BTC",
      available: "Available",
      remove: "Remove assignment",
      add: "Add buys",
      pickTitle: "Assign buys",
      pickIntro:
        "Open lots in the source account, newest first. Several can be picked at once; the assigned amounts stay editable afterwards.",
      pickEmpty: "The source account has no open lots left.",
      pickAria: "Assign the lot from {date}",
      target: "Target (amount + fee)",
      assigned: "Assigned",
      unassigned: "{amount} BTC unassigned",
      over: "{amount} BTC assigned too much",
      exceedsLot: "More than the lot has available ({available} BTC).",
      complete: "Fully assigned.",
      preview: "Result: origin",
      empty: "No buy is assigned to this transfer yet.",
      hint: "Without a complete assignment it is undecided which buys this transfer moved.",
    },
    outLeg: {
      section: "Assigned outgoing transaction",
      linked: "Linked to:",
      unlink: "Remove link",
      assign: "Assign an outgoing transaction",
      none: "No outgoing transaction is assigned to this arrival.",
      pickTitle: "Assign an outgoing transaction",
      pickIntro:
        "Unassigned outgoing transfers from other wallets and accounts. The most likely matches come first.",
      pickEmpty: "There is no matching outgoing transaction left to assign.",
      pickEmptyCreate: "Create an outgoing leg from the source account's lots instead",
      filterPeriod: "Period",
      txidMatch: "Same txid",
      alreadyPaired: "already linked",
      includePaired: "Also show outgoing transactions that already have an arrival",
      joinsGroup:
        "This outgoing transaction is already linked ({legs}). The arrival is added to the same transfer, which is right when one send arrived in several pieces; otherwise check whether the existing link is wrong (release it there).",
      inLegSection: "Assigned incoming transaction",
      inLegNone: "No incoming transaction assigned",
      inLegHowTo:
        "The link is made on the incoming transaction: open it in the target wallet and pick this outgoing transaction under “Origin & assignment”.",
      colMatch: "Match",
      searchPlaceholder: "wallet, txid, note …",
      pickAria: "Select the outgoing transaction from {date}",
      bestMatch: "Most likely match",
      dayDiff: "{days} days apart",
      diffTitle: "Amount difference",
      diffNone: "Both amounts are identical.",
      diffFee:
        "{amount} BTC difference, plausible as a network fee ({percent} of the amount).",
      diffAdopt:
        "Adopt the difference as the network fee (the outgoing amount is set to the amount that arrived, with the fee next to it)",
      diffTooLarge:
        "{amount} BTC difference ({percent} of the amount). That is too much for a network fee; these two transactions probably do not belong together.",
      diffNegative:
        "{amount} BTC more arrived than left. That cannot be a network fee.",
      confirm: "Assign",
      previewTitle: "Result: origin of this arrival",
    },
    origin: {
      section: "Origin",
      intro:
        "These original buys make up this arrival. Holding period and cost basis follow the original purchase date, not the transfer date.",
      show: "Show origin",
      hide: "Hide origin",
      acquired: "Purchase date",
      amount: "Share",
      price: "Cost / BTC",
      source: "Origin",
      status: "Holding period",
      total: "Total",
      totalValue: "worth {value} EUR",
      ofAmount: "of this transaction's {amount}",
      jump: "Go to the buy transaction",
      unknownPrice: "Cost basis unknown",
      mismatch:
        "The shares add up to {amount} BTC less or more than this transaction's amount.",
      unresolvedAmount: "{amount} BTC without a traceable origin",
      unlinked: "Origin not assigned",
      unlinkedHint:
        "This arrival is not linked to any outgoing leg. Without that link the holding period cannot be determined.",
      unresolvable:
        "This arrival is linked, but the chain behind it does not end at a buy.",
      truncated:
        "The link chain is broken (circular or too deep) and the walk stopped early.",
      assign: "Assign origin",
      badge: "Origin unresolved",
      none: "There is no origin to resolve for this transaction.",
    },
  },
  csvImport: {
    button: "Import",
    title: "Import transactions from CSV",
    steps: {
      file: "File",
      filter: "Filter",
      mapping: "Columns",
      typeValues: "Type values",
      preview: "Preview",
      import: "Import",
    },
    filterIntro:
      "Optional: limit the import to certain rows. Each condition checks one CSV column against the values that actually occur in it (e.g. only transaction_type = trade). Several conditions can be combined with AND or OR.",
    filterAddRule: "Add condition",
    filterRemoveRule: "Remove condition",
    filterColumn: "Column",
    filterColumnChoose: "choose a column",
    filterMatch: "Comparison",
    filterMatchAnyOf: "is any of",
    filterMatchNoneOf: "is none of",
    filterValues: "Values",
    filterSelectAll: "all",
    filterSelectNone: "none",
    filterSearch: "Search values …",
    filterNoValues: "No values found.",
    filterRuleInactive: "No value selected. This condition is ignored.",
    filterCombinator: {
      and: "AND",
      or: "OR",
    },
    filterMatchCount: "{matched} of {total} rows",
    filterNoRules: "No filter active. All {count} rows are imported.",
    filterEmptyResult: "No row matches the filter.",
    filterUnknownColumn:
      "This file has no column “{column}”. The condition is ignored.",
    filterUnknownColumns:
      "Columns from the preset are missing in this file: {columns}. The affected conditions are ignored.",
    summaryFilter: "Filter",
    fileIntro:
      "Choose a CSV file (e.g. your exchange's export). The file is processed entirely in your browser and never uploaded.",
    chooseFile: "Choose CSV file …",
    fileChosen: "{name} ({rows} data rows)",
    readError: "Could not read the file.",
    duplicateFile:
      "This file was already imported on {date} ({count} transactions).",
    duplicateFileHint:
      "Importing it again doubles the bookings it carries, and with them the tax history. If the export has grown since, check the preview: rows that are already there are marked as duplicates.",
    duplicateFileAck: "Read the file again anyway",
    duplicateRows: "{certain} duplicates, {probable} possible",
    duplicateIntro:
      "Duplicates are left out of the import. Identical bookings can be real (a split order, for instance), so nothing is discarded automatically.",
    duplicateBadge: "Duplicate",
    duplicateBadgeMaybe: "Possible duplicate",
    duplicateReason: {
      txid: "Same txid in the same account",
      exact: "Account, type, time, amount and value all identical",
      nearby: "Same values, {minutes} min apart",
    },
    duplicateOfRow: "Duplicate of line {line} in the same file",
    duplicateShowExisting: "Show the existing transaction",
    duplicateFilter: {
      all: "All",
      new: "New only",
      duplicates: "Duplicates only",
    },
    duplicateSkipAll: "Skip all duplicates",
    duplicateImportAll: "Import all duplicates anyway",
    summaryDuplicates: "Duplicates skipped",
    summaryDuplicatesKept: "({count} kept on purpose)",
    doneBatchId: "Import id",
    doneUndoHint: "This import can be undone as a whole in the settings.",
    emptyFile: "The file contains no data rows.",
    hasHeader: "First row contains column headers",
    delimiter: "Delimiter",
    delimiterComma: "Comma (,)",
    delimiterSemicolon: "Semicolon (;)",
    decimalSeparator: "Decimal separator",
    decimalDot: "Dot (1234.56)",
    decimalComma: "Comma (1.234,56)",
    encoding: "Character encoding",
    autoDetected: "auto-detected",
    parsing: "Reading file …",
    target: "Target for the imported transactions",
    targetWallet: "Target wallet",
    targetAccount: "Target account",
    newWalletOption: "+ Create new wallet …",
    newAccountOption: "+ Create new account …",
    newWalletName: "Name of the new wallet",
    newWalletNamePlaceholder: "Exchange",
    newAccountName: "Name of the new account",
    preset: "Import preset",
    presetManual: "Manual / no preset",
    presetSystemGroup: "Predefined",
    presetUserGroup: "My presets",
    presetPredefined: "This preset is predefined and cannot be edited or deleted.",
    presetDelete: "Delete preset",
    presetApplied: "Preset “{name}” applied automatically.",
    presetSaveAsName: "Name for the new preset (e.g. Exchange export)",
    presetSaveAs: "Save as new preset",
    presetSaved: "Preset “{name}” saved.",
    presetCandidates:
      "{count} presets fit these columns. The newest one is selected; switch here:",
    presetExportHint:
      "Configuration only, no amounts, addresses or file names.",
    column: "Column",
    mappingIntro:
      "Map the CSV columns to the transaction fields. Unmapped fields are imported empty.",
    noMapping: "no mapping",
    required: "required",
    typeFromColumn: "From column",
    typeFixed: "Fixed value",
    typeFixedHint:
      "The selected type is applied to all imported rows (e.g. for buy-only exports without a type column).",
    sample: "Sample: {value}",
    unit: "Unit",
    unitBtc: "BTC",
    unitSats: "Sats",
    fields: {
      type: "Type",
      date: "Date",
      time: "Time",
      amountBtc: "Amount (BTC)",
      pricePerBtcEur: "Price (EUR/BTC)",
      totalFiatEur: "Total (EUR)",
      feeBtc: "Fee (BTC)",
      feeFiatEur: "Fee (EUR)",
      originalCurrency: "Original currency",
      originalAmount: "Amount (original currency)",
      originalPricePerBtc: "Price per BTC (original currency)",
      txid: "Transaction ID (txid)",
      address: "Bitcoin address",
      note: "Note",
    },
    dateFormat: "Date format",
    dateFormatChoose: "choose date format",
    dateFormats: {
      iso: "ISO 8601 (2026-07-24)",
      de: "DD.MM.YYYY (24.07.2026)",
      mdy: "MM/DD/YYYY (07/24/2026)",
      dmy: "DD/MM/YYYY (24/07/2026)",
      ymd: "YYYY/MM/DD (2026/07/24)",
      "unix-s": "Unix timestamp (seconds)",
      "unix-ms": "Unix timestamp (milliseconds)",
    },
    btcFeeModeQuestion: {
      in: "Buys: is the fee already deducted from the BTC amount?",
      out: "Sells and outgoing transfers: is the fee already deducted?",
    },
    btcFeeModes: {
      deducted: "Yes, already deducted",
      notDeducted: "No, not deducted yet",
    },
    fiatFeeModeQuestion: "Is this fee already part of the EUR amount?",
    fiatFeeModes: {
      gross: "Yes, included in the amount (gross)",
      net: "No, it comes on top (net)",
    },
    amountFeeAdded: "Amount in the file {file} plus fee {fee} (see the fee setting)",
    amountFeeRemoved: "Amount in the file {file} minus fee {fee} (see the fee setting)",
    effectiveEur: "Cost / proceeds (EUR)",
    effectiveEurCostHint:
      "EUR total booked as acquisition cost (amount plus the EUR fee).",
    effectiveEurProceedsHint: "EUR proceeds booked (amount minus the EUR fee).",
    effectiveEurRate: "Rate {rate} EUR/BTC",
    eurValuationIntro:
      "{count} row(s) have no EUR value, e.g. because they were settled in another currency. The EUR value can be derived from the historical Binance price of the transaction day and stays editable afterwards.",
    eurValuationRun: "Derive missing EUR values",
    eurValuationProgress: "{done} of {total} …",
    eurValuationDone: "{count} row(s) valued",
    eurValuationFailed: "({count} without a price)",
    eurMissingHint: "EUR value missing, can be derived from the historical price",
    eurDerivedHint: "EUR value derived from the historical Binance price",
    timeFormat: "Time format",
    timeFormatChoose: "Choose time format",
    timeFormats: {
      hms: "HH:MM(:SS) (14:30:00)",
      h12: "12-hour (02:30 PM)",
      datetime: "from date and time in one column",
    },
    typeValuesIntro:
      "Map every value found in the “{column}” column to an internal transaction type. Already recognized values (e.g. “buy”) are pre-filled.",
    typeValuesUnmapped: "{count} value(s) still need a mapping before you can continue.",
    typeValuesChoose: "choose type",
    previewIntro:
      "Review the rows before importing. Invalid rows are highlighted and can be corrected inline or excluded via the toggle.",
    validRows: "{count} valid",
    errorRows: "{count} invalid",
    excludedRows: "{count} excluded",
    sumBtc: "Sum (valid rows): {amount} BTC",
    line: "Line",
    includeColumn: "Import",
    dateReadAs: "Read as: {date}",
    includeRow: "Import line {line}",
    showAllColumns: "Show all columns",
    showAllColumnsHint: "Show all columns ({count} unmapped hidden)",
    errors: {
      invalidType: "Invalid or missing type",
      invalidDate: "Invalid date",
      invalidTime: "Invalid time",
      invalidOriginal: "Amount or price in the original currency is not a number",
      invalidAmount: "Amount missing or not greater than 0",
      missingPrice: "Price or total (EUR) is required for buy/sell/spend",
      invalidPrice: "Invalid price",
      invalidTotal: "Invalid total (EUR)",
      invalidFee: "Invalid fee (must be ≥ 0)",
      invalidTxid: "Invalid transaction ID (exactly 64 hex characters)",
      invalidAddress: "Invalid Bitcoin address",
    },
    confirmIntro:
      "Ready to import. Only valid, non-excluded rows are imported. Invalid rows are skipped.",
    summaryFile: "File",
    summaryTarget: "Target",
    summaryImport: "Will be imported",
    summarySkipped: "Skipped (invalid)",
    summaryExcluded: "Excluded",
    summarySum: "Sum (BTC)",
    importNow: "Import {count} transactions",
    rowCount: "{count} rows",
    doneTitle: "Import complete",
    doneMessage: "{count} transactions have been imported and saved.",
    goToTable: "Go to transaction table",
  },
  tax: {
    disposalCount: "{count} disposal(s)",
    lotCount: "{count} position(s)",
    openPointInTime: "As of date & period",
    openPointInTimeHint:
      "The holding on a past day, and what happened in a period: the 31 December holding a tax return asks for, for instance.",
    title: "Tax (Germany, FIFO)",
    disclaimer:
      "Not tax advice. FIFO matching per §23 EStG with a {days}-day holding period.",
    export: "Export (CSV)",
    exportHint: "The selected year's disposals as a CSV file, generated locally.",
    exportFileName: "tax",
    openLots: "Open lots",
    acquired: "Acquired",
    amount: "Amount",
    remaining: "Remaining",
    costPerBtc: "Cost / BTC",
    taxFreeFrom: "Tax-free from",
    daysLeft: "{days} days left",
    taxFreeNow: "Tax-free",
    taxable: "Taxable",
    taxableDaysLeft: "Taxable, {days} days left",
    disposals: "Disposals (realized)",
    proceeds: "Proceeds",
    cost: "Cost",
    gain: "Gain/Loss",
    taxableGain: "Taxable",
    taxFreeGain: "Tax-free",
    uncoveredWarning:
      "{amount} BTC disposed without a matching lot. Check for missing buys/transfers.",
    giftsOut: "Given away",
    giftsOutHint:
      "Giving coins away is not a private disposal under §23 EStG: there are no proceeds and therefore no taxable gain. Gift tax may apply instead, which this app does not calculate. What is listed is the acquisition cost of the coins given away, because that is where a gift tax return starts. Not tax advice.",
    income: "Income (coins received)",
    incomeHint:
      "Coins received as payment or reward are taxed at their market value on the day they arrive, and outside private disposals (depending on the case, e.g. as business income or as other income). That is why they are not in the table above. The holding period for a later sale starts on receipt. Not tax advice.",
    incomeValue: "Value on receipt",
    incomeTotal: "Total received: {amount}",
    unknownBasis: "Cost basis unknown (external transfer)",
    unresolvedOriginHint:
      "{amount} BTC of this disposal come from lots without a traceable origin. Their holding period rests on an arrival date, not a purchase date.",
    emptyLots: "No open lots.",
    emptyDisposals: "No sells or spends yet.",
    year: "Year",
    totalRealized: "Total realized",
  },
  presets: {
    title: "Import presets",
    intro:
      "A preset records how one particular export is read: delimiter, formats, column mapping, fee conventions. Predefined presets ship with the app and are read-only; your own live in your portfolio file and travel with it.",
    systemTitle: "Predefined",
    systemEmpty:
      "The app ships no predefined presets at the moment. A working import can be exported as JSON at the end of the wizard and contributed; see config/import-presets/README.md.",
    userTitle: "My presets",
    userEmpty:
      "No presets of your own yet. At the end of an import you can save the settings as a preset.",
    readOnly: "Read-only: only an app update changes this preset.",
    noProvider: "No provider",
    noSignature: "no column signature",
    signatureColumns: "{count} columns in the signature",
    formatVersionShort: "format v{version}",
    rename: "Rename",
    duplicate: "Duplicate as my own preset",
    copySuffix: "(copy)",
    duplicated: "“{name}” created.",
    delete: "Delete",
    deleteConfirm: "Delete preset “{name}”?",
    importTitle: "Take a preset in from JSON",
    importIntro:
      "A shared preset file is validated and taken in as your own preset. One that does not match the schema is refused with a reason instead of being half applied.",
    importAction: "Choose JSON file",
    importFailed: "This file is not a valid preset:",
    imported: "Preset “{name}” taken in.",
    field: {
      name: "Name",
      provider: "Provider",
      formatVersion: "Format version",
      id: "ID",
      description: "Description",
      headerSignature: "Column signature",
    },
    export: {
      action: "Export preset as JSON",
      title: "Export preset",
      intro:
        "The file contains the configuration only, so no transactions, amounts, addresses or file names. Provider and format version are what let several export formats of one provider exist side by side.",
      headerHint:
        "The column signature is the header row of the file you imported. It is how the wizard recognises the same export next time; you may adjust it.",
      removedTitle: "Left out of the export",
      removedHint:
        "These values look like data rather than configuration, so they do not belong in a shared preset.",
      reason: {
        address: "bitcoin address",
        txid: "transaction id",
        amount: "amount",
        email: "e-mail address",
        iban: "IBAN",
      },
      invalid: "The preset cannot be exported yet:",
      preview: "Show JSON",
      copy: "Copy to clipboard",
      copied: "Copied.",
      download: "Save as file",
    },
    issue: {
      notJson: "The file is not readable JSON.",
      notObject: "The file holds no preset object.",
      missing: "Required field is missing.",
      invalidValue: "Value not allowed (allowed: {detail}).",
      unsupportedSchemaVersion:
        "Schema version {detail} is unknown to this app version.",
      emptyMapping: "Not a single column is mapped.",
      emptyHeaderSignature:
        "Without a column signature no file can be recognised.",
      typeConflict:
        "A fixed type and a mapped type column exclude each other.",
      personalData:
        "Looks like personal data: {detail}. Presets hold configuration only.",
    },
  },
  imports: {
    title: "Imports",
    intro:
      "Every CSV import is recorded with its file, preset and count. That is how the wizard recognises the same file next time, and how an import can be taken back as a whole.",
    date: "When",
    file: "File",
    preset: "Preset",
    count: "Transactions",
    manualPreset: "mapped by hand",
    undo: "Undo",
    undoTitle: "Undo this import",
    undoIntro: "“{file}” contributed {count} transactions. They will be removed.",
    undoConfirm: "Remove {count} transactions",
    blockedIntro:
      "{count} of them are now referenced by other transactions and will stay:",
    blocked: {
      allocatedByOther: "used as a lot by a later disposal",
      linkedTransfer: "linked to a transfer whose counterpart stays",
      allocatesOther: "closes lots that did not come from this import",
    },
    blockedHint:
      "Only the {count} unreferenced transactions are removed. Release the others by hand first (the lot assignment or the transfer link), so no reference is left pointing at nothing.",
  },
  watchlist: {
    title: "Address watchlist",
    subtitle:
      "Watch-only: monitor addresses or xpubs. Live data comes from the configured explorer source and is never stored.",
    add: "Add address",
    addressOrXpub: "Address or xpub",
    label: "Label",
    labelPlaceholder: "Hardware wallet, account 1",
    tags: "Tags (comma-separated)",
    type: "Type",
    invalidValue: "Please enter a valid Bitcoin address or xpub.",
    xpubWarning:
      "Warning: anyone who knows this xpub can see the wallet's entire transaction history and all future addresses. Use watch-only and never share it.",
    xpubNotScanned:
      "xpub scanning (automatic address derivation) is planned for a later version. The entry is stored, but live data is currently only available for single addresses.",
    deleteConfirm: "Remove “{label}” from the watchlist?",
    empty: "No watched addresses yet.",
    balance: "Balance",
    txCount: "Transactions",
    utxos: "UTXOs",
    privacyScore: "Privacy score",
    findings: {
      addressReuse:
        "Address was used {count}× for receiving (address reuse). Prefer a fresh address for every payment.",
      pubkeyLeaked:
        "Public key is visible on-chain due to a previous spend (relevant e.g. for quantum-risk discussions).",
      legacyFormat:
        "Legacy/P2SH address format: modern formats (native SegWit bc1q / Taproot bc1p) offer lower fees and better privacy.",
      possiblePoisoning:
        "Dust deposit detected, possible address poisoning. Be extra careful when copying addresses from your history; never “return” such amounts.",
      dustUtxo:
        "{count} dust UTXO(s): spending them would cost more in fees than they are worth.",
      roundAmounts:
        "{count} conspicuously round received amounts. That makes chain analysis (change detection) easier.",
    },
    utxoTable: {
      outpoint: "Outpoint",
      value: "Value",
      date: "Date",
      labelTag: "Label / tags",
      dust: "Dust",
      editLabel: "Edit label",
    },
    consolidation:
      "{count} small UTXOs and currently low fees ({fee} sat/vB). A good time to consolidate.",
    feeRate: "Fees (economy)",
    loadError: "Could not load live data: {error}",
    noLiveData: "No live data for xpub entries.",
  },
  lock: {
    title: "Locked",
    passwordPlaceholder: "Password",
    unlock: "Unlock",
    unlocking: "Decrypting …",
    wrongPassword: "Wrong password. Please try again.",
    failed: "Unlocking failed.",
    blocked:
      "After {attempts} failed attempts: the next one is possible in {seconds} seconds.",
    hint:
      "The data is encrypted and no longer sits decrypted in memory. Without the password nobody gets at it, including you.",
    closeFile: "Close file",
    lockNow: "Lock now",
    cannotLock: "Unencrypted files cannot be locked",
    warningTitle: "Locking shortly",
    warningBody:
      "Locking in {seconds} seconds because of inactivity. Pending changes are saved first.",
    warningDeferred:
      "Locking is waiting: a running operation finishes first.",
    stayUnlocked: "Stay unlocked",
    busyToast: "Cannot lock: an operation is still running. Try again once it is done.",
  },
  backups: {
    title: "Backups",
    intro:
      "Your data lives in a single file. So that one damaged or lost copy does not mean everything, the app writes encrypted copies into a folder you choose, and reads each one back immediately to check that it can actually be restored.",
    unsupported:
      "This browser cannot open a folder (no File System Access API), so automatic backups are not possible here. You can create a backup as a download at any time, but you have to trigger it yourself.",
    noFolder:
      "No backup folder has been chosen yet. Without one the app cannot write copies.",
    noFolderShort: "No backup folder chosen",
    folderHint:
      "The portfolio file's handle cannot write neighbouring files. Backups therefore need a folder, chosen once; the choice is remembered.",
    folder: "Folder",
    chooseFolder: "Choose a backup folder",
    changeFolder: "Different folder",
    forgetFolder: "Forget folder",
    reconnect: "Grant access again",
    permissionNeeded:
      "After a browser restart, write access to the folder has to be confirmed once.",
    backupNow: "Back up now",
    running: "Backing up …",
    download: "Download a backup",
    empty: "No backups in this folder yet.",
    when: "When",
    size: "Size",
    contents: "Contents",
    inspect: "Inspect",
    restore: "Restore",
    password: "Backup password",
    passwordPlaceholder: "Password",
    passwordHint:
      "Used only to decrypt in your browser. Older backups may carry an earlier password.",
    transactions: "{count} transactions",
    lastTransaction: "last transaction: {date}",
    noTransactions: "no transactions",
    integrityMismatch: "Checksum does not match",
    lastOk: "Backup written and verified: {name} ({pruned} old ones removed)",
    confirmTitle: "Restore this backup?",
    confirmBody:
      "The current state will be replaced by the state in the backup. Check both sides before you continue.",
    currentFile: "Currently open",
    theBackup: "Backup",
    safetyNote:
      "Before restoring, a backup of the current state is written and verified automatically, so this can be undone again.",
    restoreConfirm: "Yes, restore",
    restoring: "Restoring …",
    openView: "Open backups",
    reminderNever: "There is no verified backup of this file yet.",
    reminderDays: "The last verified backup was {days} days ago.",
    error: {
      noDirectory: "No backup folder chosen.",
      noPortfolio: "No file open.",
      writeFailed: "The backup could not be written.",
      verifyFailed:
        "The backup was written but could not be read back. Do not rely on it.",
      permission: "Access to the backup folder has to be granted again.",
      wrongPassword: "Wrong password for this backup.",
      readOnly: "The file is open for viewing only.",
    },
  },
  readOnly: {
    badge: "Read-only",
    badgeTitle:
      "This file is open for viewing. Nothing is written: no saving, no autosave, no backup.",
    enable: "View only",
    enableTitle: "Switch to read-only: the file is not changed from here on.",
    disable: "Enable editing",
    disableConfirm: "Enable editing? Changes will be written to this file again.",
    blocked: "Read-only: that change was not applied.",
    disabledHint: "Locked in read-only mode. Choose \u201cEnable editing\u201d in the header.",
    openLabel: "Open for viewing only",
    rememberFile: "Always open this file for viewing only",
    settingsTitle: "Read-only mode",
    settingsBody:
      "Opened for viewing: the file can be read, analysed and exported, but not changed. Nothing is written, not even an autosave. Appearance, layout and columns can still be adjusted; they apply to this session only.",
    settingsState: "State",
    stateOn: "Read-only",
    stateOff: "Editing",
    viewBackup: "Open for viewing",
    viewBackupHint: "Opens this backup read-only. The file you have open stays as it is.",
    viewBackupUnsaved:
      "There are unsaved changes. Open the backup for viewing anyway? Those changes are lost.",
  },
  conflict: {
    title: "The file has changed in the meantime",
    intro:
      "This portfolio file on disk is no longer the one you opened. Usually that means another device or a sync service has written it. Nothing was saved, and you decide which version counts.",
    mine: "Open here",
    theirs: "On disk",
    transactions: "Transactions",
    lastTransaction: "Last transaction",
    modified: "Modified",
    theirsWrongPassword:
      "The version on disk cannot be read with this session's password. It can still be backed up and overwritten, but not shown here.",
    theirsUnreadable:
      "The version on disk cannot be read. It can still be backed up and overwritten, but not shown here.",
    loadExternal: "Load the external version",
    loadExternalHint:
      "Your changes in this session are lost. A backup of them is written first.",
    saveAs: "Save as a new file",
    saveAsHint:
      "Both versions are kept: you pick a new location for this session's state.",
    overwrite: "Overwrite the external version",
    overwriteHint:
      "The version on disk is lost. It is downloaded as a copy first.",
    later: "Decide later",
    noticed: "The file has been changed outside this app.",
    noticedAction: "Check",
  },
  pit: {
    title: "As of date",
    banner:
      "Historical view: this is how your portfolio stood on {date}. Every figure below refers to that day, not to today.",
    from: "From",
    to: "To",
    clearFrom: "Single day only",
    bannerPeriod:
      "Historical view: {from} to {to}. The movements refer to that period, every other figure to {to}.",
    periodTitle: "In this period",
    opening: "Holding at the start",
    closing: "Holding at the end",
    change: "Change",
    boughtSold: "Bought {bought} · disposed of {sold}",
    realized: "Realised in the period",
    realizedSplit: "Taxable {taxable} · tax-free {free}",
    periodCounts: "{transactions} transactions, {disposals} of them disposals",
    periodGifts: "{count} gift(s) given away",
    periodIncome: "{count} income receipt(s)",
    date: "As of",
    holding: "Holding on that day",
    costBasis: "Acquisition cost",
    basisPartial:
      "{amount} has no recorded cost; that quantity is not part of the acquisition cost.",
    marketValue: "Value on that day",
    atPrice: "At that day's price of {price}",
    noPrice: "The price for that day has not been loaded.",
    loadPrice: "Load price",
    taxFreeThen: "Tax-free on that day",
    lockedThen: "Inside the holding period: {amount}",
    unresolvedThen: "{amount} with no traceable origin, so not judgeable.",
    byAccount: "Holding per wallet and account",
    openLots: "Open lots on that day",
    stillLocked: "Holding period running",
    empty: "There was no holding on that day yet.",
    exportCsv: "Export (CSV)",
    exportHint: "Download the as-of overview as a CSV file.",
    exportFileName: "as-of",
    exportAsOf: "As of",
    printPdf: "As PDF",
    printHint: "Opens the browser's print dialog, where \u201csave as PDF\u201d is available.",
    disclaimer:
      "Computed by the same rules as the live view, over every transaction up to and including that date. This view is read-only and changes nothing in your file. Not tax advice.",
  },
  goal: {
    none: "No savings goal set. Set one in the settings, under \u201cGeneral\u201d.",
    of: "of {target}",
    current: "Currently",
    remaining: "To go",
    needed: "Needed per month",
    pace: "So far per month",
    reached: "Target reached.",
    by: "Target date: {date}",
    projected: "At the pace so far, reached around {date}.",
    datePassed: "The target date was {date}.",
    settingsTitle: "Savings goal",
    settingsBody:
      "A status display and nothing more: progress, what is left and, with a target date, the rate that would need. Without a goal the widget does not appear.",
    target: "Target amount",
    targetUnit: "Unit",
    targetDate: "Target date (optional)",
    clear: "Remove goal",
  },
  offline: {
    badge: "Offline",
    hint: "No connection. Your file, every calculation and the tax figures work exactly as before; only prices and on-chain data cannot be refreshed.",
    priceAsOf: "Offline, as of {time}",
    unavailable: "Not available offline.",
  },
  update: {
    action: "Load new version",
    short: "Update",
    hint: "A new version is ready. It loads when you say so; anything you are typing would be lost.",
  },
  print: {
    fromFile: "From the file",
    partOf: "Part {part} of {total}",
    generated: "Generated {time}",
    disclaimer:
      "Produced with DepotWatch Orange from the portfolio file named above. Without warranty, and no substitute for tax advice.",
  },
  settings: {
    title: "Settings",
    nav: {
      general: "General",
      appearance: "Appearance",
      security: "Security",
      backups: "Backups",
      history: "Change history",
      import: "Import",
      tax: "Tax",
      explorer: "Explorer",
    },
    general: "General",
    language: "Language",
    currencyBtc: "BTC (amounts in sats)",
    laserEyes: "Laser eyes",
    laserEyesHint: "Purely cosmetic: the logo runs hot.",
    theme: "Colour theme",
    themes: {
      ocean: "Ocean (default)",
      night: "Night",
      terminal: "Terminal",
      gold: "Gold",
      paper: "Paper",
      sunrise: "Sunrise",
      nord: "Nord",
      mono: "Monochrome",
      mempool: "Mempool",
    },
    themeMode: {
      fixed: "Fixed theme",
      system: "Follow the system",
    },
    themeSystemHint:
      "Switches automatically when your operating system changes between light and dark. Pick a theme for each case.",
    themeForLight: "When the system is light",
    themeForDark: "When the system is dark",
    colorBlindSafe: "Colour-vision friendly",
    colorBlindSafeHint:
      "Gains are shown in blue instead of green, losses stay red. Independent of the chosen theme; the app always shows direction arrows anyway.",
    currency: "Display currency",
    security: "Security & file",
    changePassword: "Change password",
    newPassword: "New password",
    encryptionOn: "Encryption active (AES-256-GCM)",
    encryptionOff: "Encryption disabled",
    disableEncryption: "Disable encryption",
    enableEncryption: "Enable encryption",
    disableEncryptionConfirm:
      "Really save without encryption? Anyone with access to the file can read all data.",
    passwordChanged: "Password changed. It will be used on the next save.",
    lock: "Lock on inactivity",
    lockAfter: "Lock automatically after",
    lockMinutes: "{count} minutes",
    lockNever: "Never",
    lockOnHide: "Lock as soon as the tab is hidden or minimised",
    lockOnHideHint:
      "Locks the moment the tab goes into the background. Useful on a shared machine, but interrupting if you switch windows often.",
    lockShowFileName: "Show the file name on the lock screen",
    lockShowFileNameHint:
      "Off leaves out even the file name, in case that already says too much.",
    lockNeedsEncryption:
      "This file is not encrypted and therefore cannot be locked: without a password there is nothing to lock it with. Set a password above and the lock takes effect.",
    lockHint:
      "Locking saves pending changes first, then removes the decrypted data and the password from memory. Unlocking needs the password again. Lock by hand with Ctrl/Cmd + L.",
    appearance: "Appearance",
    backupSchedule: "Schedule and retention",
    backups: "Backups",
    backupTriggerLabel: "Write a backup",
    backupKeepLatest: "Keep this many recent backups",
    backupReminderDays: "Remind after (days without a backup)",
    backupRetentionHint:
      "On top of that, one per day for the last {daily} days, one per week for the last {weekly} weeks and one per month for the last {monthly} months are kept. Nothing is deleted unless at least one verified backup remains afterwards.",
    backupLastOk: "Last backup verified: {when}",
    backupLastUnverified:
      "The backup from {when} could not be verified. Do not rely on it.",
    backupNever: "There is no verified backup of this file yet.",
    backupWithNewPassword: "Create a backup with the new password",
    passwordChangedBackups:
      "Existing backups stay encrypted with the old password and can only be opened with it. Best to write a fresh backup right away.",
    passwordChangeBackupWarning:
      "A new password only applies to future saves. Every existing backup still needs the old one.",
    changeLog: "Change history",
    changeLogHint:
      "The most recent changes to this file, for traceability and for taking single actions back. This is not a backup: that is what the backups are for.",
    changeLogEmpty: "No changes recorded yet.",
    undo: "Undo",
    notUndoable: "too large",
    changeKind: {
      add: "{count} transaction(s) recorded",
      update: "{count} transaction(s) edited",
      delete: "{count} transaction(s) deleted",
      move: "{count} transaction(s) moved",
      import: "{count} transaction(s) imported",
      importUndo: "Import undone ({count})",
      restore: "Restore ({count} affected)",
    },
    backupTrigger: {
      everySave: "On every save",
      daily: "Once a day",
      manual: "Manually only",
    },
    explorer: "Explorer source (on-chain data)",
    explorerPublic: "Public API",
    explorerCustom: "Own server (Esplora-compatible)",
    explorerEndpoint: "Endpoint URL",
    explorerPrivacyNote:
      "Note: with public APIs your watched addresses are sent to a third party (including your IP). For maximum privacy use your own node/server.",
    importSettings: "Import",
    duplicateTolerance: "Time tolerance for duplicates (minutes)",
    duplicateToleranceHint:
      "During a CSV import, otherwise identical bookings within this span count as a possible duplicate. Exports disagree about time zones and rounding, so comparing timestamps exactly is not enough. 0 switches the tolerance off; exact matches are still recognised.",
    taxSettings: "Tax",
    holdingPeriod: "Holding period (days)",
    costBasisMethod: "Cost basis method",
    taxExemptionLimit: "Exemption limit for private sales (EUR)",
    taxExemptionLimitHint:
      "The §23 EStG limit, configurable because the legislator changes it (600 € until 2023, 1,000 € since 2024). It is a limit, not an allowance: exceed it and the entire gain becomes taxable, not just the part above it.",
    autosave: "Autosave",
    autosaveDebounce: "Delay after change (ms)",
    autosaveNote:
      "Autosave only applies in direct file access mode. In fallback mode you save via the Save button.",
    fileMode: "File mode",
    fileModeFsa: "Direct file access (automatic saving)",
    fileModeFallback: "Upload/download (manual saving)",
  },
};

export default en;
