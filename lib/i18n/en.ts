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
    loading: "Loading …",
    error: "Error",
    confirmDelete: "Really delete?",
    none: "None",
    refresh: "Refresh",
    optional: "optional",
    unknown: "unknown",
    yes: "Yes",
    no: "No",
  },
  start: {
    openFile: "Open portfolio file",
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
      "Create your first wallet with an account. It is needed for your first transaction (e.g. wallet “Kraken” with account “Spot”).",
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
      "Placeholder: fill in the real details before publishing the site.",
    providerTitle: "Information pursuant to § 5 DDG (German Digital Services Act)",
    providerBody: "[First name Last name]\n[Street and number]\n[Postal code, city]\nGermany",
    contactTitle: "Contact",
    contactBody: "Email: [kontakt@depotwatch-orange.com]",
    responsibleTitle: "Responsible for the content",
    responsibleBody: "[First name Last name, address as above]",
  },
  privacyPolicy: {
    metaTitle: "Privacy | DepotWatch Orange",
    title: "Privacy Policy",
    placeholder:
      "Placeholder: have this reviewed legally and completed before publishing.",
    noStorageTitle: "No storage of user data",
    noStorageBody:
      "DepotWatch Orange is a pure client application. All portfolio data lives exclusively in a local, password-encrypted file on your device. There is no server storing user data, no account, and no tracking (no cookies, no analytics tools).",
    externalTitle: "Requests to external services",
    externalIntro:
      "While you use the app, data is fetched from external interfaces at runtime. For technical reasons the respective provider receives your IP address and the request data:",
    externalBinance: "Binance (price data): no portfolio data is transmitted.",
    externalExplorer:
      "mempool.space / blockstream.info (on-chain data): the Bitcoin addresses you added to the watchlist are transmitted. The settings let you configure your own server instead.",
    hostingTitle: "Hosting",
    hostingBody: "[Add details about the hosting provider and any server logs.]",
    controllerTitle: "Controller",
    controllerBody: "[See the legal notice, details to be added.]",
  },
  nav: {
    dashboard: "Dashboard",
    transactions: "Transactions",
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
      "{amount} BTC of your sells, spends, or outgoing transfers have no matching purchase in the portfolio (e.g. a CSV export that starts mid-history). The holding above is correct, but cost basis, average cost, and unrealized P/L are incomplete.",
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
        "{amount} BTC of your holding have no cost basis, for example receives from outside without a price. That amount is part of neither the cost basis nor the gain, because its full market value would otherwise show up as profit.",
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
      feesUnvalued: "{amount} BTC of fees have no daily close, so they are left out of the total.",
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
      markerSummary: "{price} · {amount} BTC · {count} trade(s)",
      markerBucket: {
        week: "Markers grouped by week ({count} trades in the period)",
        month: "Markers grouped by month ({count} trades in the period)",
      },
      markerWithoutPrice: "{count} trade(s) without a recorded price, not on the chart",
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
      yearInReviewEmpty: "No completed year in the ledger yet.",
      yearInReviewStacked: "Net stacked in {year}",
      custodyEmpty: "No holdings yet.",
      taxFreeNow: "Tax-free right now",
      allTaxFree: "The entire holding is tax-free.",
      taxFreeFrom: "Tax-free from",
      daysLeft: "Days",
      holdingPeriodUnresolved:
        "{amount} BTC without a traceable origin: no holding period can be determined for them.",
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
    accountName: "Account name",
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
    types: {
      buy: "Buy",
      sell: "Sell",
      transfer_in: "Transfer (in)",
      transfer_out: "Transfer (out)",
      transfer: "Transfer",
      spend: "Spend",
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
    transferBestMatch: "🎯 most likely match",
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
    newAccountName: "Name of the new account",
    preset: "Import preset",
    presetManual: "Manual / no preset",
    presetSystemGroup: "Predefined",
    presetUserGroup: "My presets",
    presetPredefined: "This preset is predefined and cannot be edited or deleted.",
    presetDelete: "Delete preset",
    presetApplied: "Preset “{name}” applied automatically.",
    presetSaveAsName: "Name for the new preset (e.g. Kraken)",
    presetSaveAs: "Save as new preset",
    presetSaved: "Preset “{name}” saved.",
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
    unknownBasis: "Cost basis unknown (external transfer)",
    unresolvedOriginHint:
      "{amount} BTC of this disposal come from lots without a traceable origin. Their holding period rests on an arrival date, not a purchase date.",
    emptyLots: "No open lots.",
    emptyDisposals: "No sells or spends yet.",
    year: "Year",
    totalRealized: "Total realized",
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
  settings: {
    title: "Settings",
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
