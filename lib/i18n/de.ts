const de = {
  app: {
    name: "DepotWatch Orange",
    tagline: "Dein Bitcoin-Portfolio. Deine Datei. Kein Server.",
  },
  common: {
    save: "Speichern",
    cancel: "Abbrechen",
    delete: "Löschen",
    edit: "Bearbeiten",
    add: "Hinzufügen",
    close: "Schließen",
    actions: "Aktionen",
    loading: "Lädt …",
    error: "Fehler",
    confirmDelete: "Wirklich löschen?",
    none: "Keine",
    refresh: "Aktualisieren",
    optional: "optional",
    unknown: "unbekannt",
    showMore: "Weitere {count} anzeigen",
    yes: "Ja",
    no: "Nein",
  },
  start: {
    openFile: "Portfolio-Datei öffnen",
    damagedTitle: "Diese Datei ist beschädigt",
    damaged: {
      integrity:
        "Der Inhalt passt nicht zur Prüfsumme, die in der Datei steht. Sie wurde nach dem letzten Speichern verändert oder ist beim Schreiben oder Kopieren beschädigt worden.",
      truncated:
        "Die Datei bricht mitten im Inhalt ab. Vermutlich wurde ein Speichervorgang unterbrochen oder die Kopie ist unvollständig.",
      unreadable:
        "Die Datei ließ sich nicht lesen. Entweder ist es keine Portfolio-Datei oder ihr Inhalt ist zerstört.",
    },
    damagedAdvice:
      "Sie wird deshalb nicht automatisch geöffnet. Öffne stattdessen ein Backup: Backups sind vollwertige Portfolio-Dateien und liegen in deinem Backup-Ordner.",
    damagedOpenBackup: "Backup-Datei öffnen",
    damagedOpenAnyway: "Trotzdem öffnen",
    createFile: "Neues Portfolio anlegen",
    passwordTitle: "Passwort eingeben",
    passwordFor: "Passwort für {name}",
    newPasswordTitle: "Passwort für die neue Datei festlegen",
    passwordPlaceholder: "Passwort",
    passwordRepeat: "Passwort wiederholen",
    passwordMismatch: "Passwörter stimmen nicht überein.",
    noEncryption: "Ohne Verschlüsselung fortfahren (nicht empfohlen)",
    wrongPassword: "Falsches Passwort oder beschädigte Datei.",
    invalidFile: "Datei konnte nicht gelesen werden (kein gültiges Portfolio-Format).",
    unlock: "Entsperren",
    create: "Anlegen",
    localFirst:
      "Alle Daten bleiben in einer einzigen, passwortverschlüsselten Datei auf deinem Gerät. Es gibt keinen Server, kein Konto, kein Tracking.",
    howItWorks: "So funktioniert's",
    loadDemo: "Testportfolio laden",
    demoHint:
      "Lädt Beispieldaten zum Ausprobieren. Deine Änderungen werden erst beim Speichern in einer eigenen Datei gesichert, die Beispieldatei bleibt dabei unverändert.",
    demoLoadError: "Testportfolio konnte nicht geladen werden.",
    demoFileName: "Testportfolio.dwp",
  },
  wizard: {
    title: "Neues Portfolio anlegen",
    titleSaveExisting: "Testdaten speichern",
    stepOf: "Schritt {current} von {total}",
    steps: {
      location: "Speicherort",
      password: "Passwort",
      wallet: "Erstes Wallet",
      summary: "Zusammenfassung",
    },
    locationIntroFsa:
      "Wähle, wo deine Portfolio-Datei gespeichert werden soll. Änderungen werden später automatisch dorthin geschrieben.",
    locationIntroFallback:
      "Dein Browser unterstützt keinen direkten Dateizugriff. Die Datei wird am Ende des Assistenten als Download gespeichert. Wähle hier den Dateinamen.",
    chooseLocation: "Speicherort wählen …",
    locationChosen: "Ausgewählt: {name}",
    fileNameLabel: "Dateiname",
    passwordIntro:
      "Die Datei wird mit diesem Passwort verschlüsselt (AES-256-GCM). Ohne Passwort kann niemand die Daten wiederherstellen, auch du nicht.",
    strength: "Passwortstärke",
    strengthWeak: "schwach",
    strengthMedium: "mittel",
    strengthStrong: "stark",
    walletIntro:
      "Lege dein erstes Wallet mit einem Konto an. Es wird für deine erste Transaktion benötigt (z. B. Wallet „Börse“ mit Konto „Spot“).",
    summaryIntro: "Bitte prüfe deine Angaben. Mit „Erstellen“ wird die Datei angelegt und gespeichert.",
    summaryIntroExisting:
      "Bitte prüfe deine Angaben. Deine bisherigen Testdaten werden unverändert in die neue Datei übernommen.",
    summaryLocation: "Speicherort",
    summaryDownload: "Download ({name})",
    summaryEncryption: "Verschlüsselung",
    summaryEncrypted: "aktiviert (AES-256-GCM)",
    summaryUnencrypted: "deaktiviert",
    summaryWallet: "Wallet",
    summaryAccount: "Konto",
    summaryExistingData: "Daten",
    summaryExistingDataValue: "{wallets} Wallets, {transactions} Transaktionen",
    back: "Zurück",
    next: "Weiter",
    create: "Erstellen & speichern",
  },
  footer: {
    openSource: "Open Source",
    github: "Don't trust, verify on GitHub",
    help: "Hilfe",
    imprint: "Impressum",
    privacy: "Datenschutz",
    genesisHeadline:
      "The Times 03/Jan/2009 Chancellor on brink of second bailout for banks",
    runningBitcoin: "Running bitcoin. (Hal Finney, 10. Januar 2009)",
  },
  howItWorks: {
    metaTitle: "So funktioniert's | DepotWatch Orange",
    metaDescription:
      "Wie DepotWatch Orange funktioniert: Local-First, eine verschlüsselte Datei, kein Server. Die Sicherheitsarchitektur im Detail.",
    title: "So funktioniert's",
    intro:
      "DepotWatch Orange ist bewusst anders gebaut als typische Portfolio-Tracker. Diese Seite erklärt die Architektur, mit dem Schwerpunkt darauf, warum deine Daten sicher sind.",
    localFirstTitle: "Local-First: kein Server, keine Cloud, kein Konto",
    localFirstBody:
      "Alle deine Daten (Wallets, Konten, Transaktionen, Einstellungen) liegen in einer einzigen Datei auf deinem eigenen Gerät. Es gibt keine Serverdatenbank, keine Registrierung und kein Tracking. Die App läuft vollständig in deinem Browser: Was du erfasst oder per CSV importierst, verlässt deinen Rechner zu keinem Zeitpunkt. Niemand außer dir kann deine Bestände einsehen, auch wir nicht, denn es existiert schlicht kein Ort, an dem sie gespeichert wären.",
    filesTitle: "Öffnen & Speichern: direkte Dateizugriffe im Browser",
    filesBody:
      "In Browsern mit File System Access API (z. B. Chrome, Edge) wählst du deine Portfolio-Datei einmal aus; danach schreibt die App Änderungen nach kurzer Verzögerung automatisch dorthin zurück (Autosave). In Browsern ohne diese API (z. B. Firefox, Safari) öffnest du die Datei per Upload-Dialog und speicherst Änderungen über den Speichern-Button als Download. In beiden Fällen gilt: Die Datei bewegt sich nur zwischen deinem Browser und deiner Festplatte, nie über das Netz.",
    encryptionTitle: "Verschlüsselung: dein Passwort, dein Schlüssel",
    encryptionBody:
      "Deine Datei wird standardmäßig mit AES-256-GCM verschlüsselt. Der Schlüssel wird per PBKDF2-SHA256 mit 600.000 Iterationen aus deinem Passwort abgeleitet, direkt im Browser über die WebCrypto-API. Das Passwort selbst wird nirgends gespeichert, es existiert nur im Arbeitsspeicher, solange die Datei geöffnet ist.",
    encryptionWarning:
      "Wichtig: Es gibt keinen Passwort-Reset. Da nichts auf einem Server liegt, kann dir niemand ein neues Passwort schicken oder die Datei entschlüsseln, auch wir nicht. Verlierst du Passwort oder Datei, sind die Daten unwiederbringlich verloren. Verwahre beides sicher und lege regelmäßig Backups der Datei an (die Datei ist verschlüsselt, du kannst sie also bedenkenlos z. B. auf einem USB-Stick sichern).",
    watchlistTitle: "Watchlist: bewusst getrennt vom Portfolio",
    watchlistBody:
      "Die Adress-Watchlist (Salden, UTXOs, Privacy-Checks) ist watch-only und vom Portfolio-Ledger getrennt: Beobachtete Adressen sind niemals automatisch Teil deiner Bestände, und deine erfassten Transaktionen werden nie mit On-Chain-Abfragen verknüpft. Das hat einen Sicherheits- und einen Privacy-Grund: Live-Daten aus der Timechain kommen von einer konfigurierbaren Explorer-Quelle (auf Wunsch dein eigener Node). Bei öffentlichen APIs sieht der Anbieter die abgefragten Adressen. Dein Ledger dagegen braucht überhaupt keine Netzwerkzugriffe. So entscheidest du pro Adresse, was du abfragst, und dein Portfolio bleibt auch dann vollständig privat, wenn du die Watchlist gar nicht nutzt.",
    openSourceTitle: "Open Source: Don't trust, verify",
    whitepaperBody:
      "Das Bitcoin-Whitepaper ist in dieser App enthalten: neun Seiten, direkt aus dem Projekt geladen, ohne Anfrage an Dritte.",
    whitepaperLink: "Bitcoin: A Peer-to-Peer Electronic Cash System (PDF)",
    openSourceBody:
      "All das musst du uns nicht glauben. DepotWatch Orange ist Open Source (MIT-Lizenz). Jeder kann den Code prüfen: ob wirklich nichts hochgeladen wird, wie die Verschlüsselung implementiert ist und was die App sonst tut.",
  },
  imprint: {
    metaTitle: "Impressum | DepotWatch Orange",
    title: "Impressum",
    placeholder:
      "Noch unvollständig: Die mit eckigen Klammern markierte Anschrift muss vor der Veröffentlichung eingetragen werden. Ein Impressum ohne ladungsfähige Anschrift erfüllt die Pflicht nicht.",
    providerTitle: "Angaben gemäß § 5 DDG und § 18 Abs. 1 MStV",
    providerBody:
      "Marcus Gerhardy\nAzaleenring 72\n49744 Geeste\nDeutschland",
    contactTitle: "Kontakt",
    contactBody:
      "E-Mail: marcus.gerhardy@googlemail.com\n\nDepotWatch Orange wird privat und ohne Gewinnerzielungsabsicht betrieben. Anfragen beantworte ich per E-Mail; eine Telefonnummer wird nicht vorgehalten.",
    liabilityContentTitle: "Haftung für Inhalte",
    liabilityContentBody:
      "Als Diensteanbieter bin ich gemäß § 7 Abs. 1 DDG für eigene Inhalte auf diesen Seiten nach den allgemeinen Gesetzen verantwortlich. Nach §§ 8 bis 10 DDG bin ich als Diensteanbieter jedoch nicht verpflichtet, übermittelte oder gespeicherte fremde Informationen zu überwachen oder nach Umständen zu forschen, die auf eine rechtswidrige Tätigkeit hinweisen. Verpflichtungen zur Entfernung oder Sperrung der Nutzung von Informationen nach den allgemeinen Gesetzen bleiben hiervon unberührt. Eine diesbezügliche Haftung ist jedoch erst ab dem Zeitpunkt der Kenntnis einer konkreten Rechtsverletzung möglich. Bei Bekanntwerden entsprechender Rechtsverletzungen entferne ich diese Inhalte umgehend.",
    liabilityLinksTitle: "Haftung für Links",
    liabilityLinksBody:
      "Dieses Angebot enthält Links zu externen Websites Dritter, auf deren Inhalte ich keinen Einfluss habe. Deshalb kann ich für diese fremden Inhalte auch keine Gewähr übernehmen. Für die Inhalte der verlinkten Seiten ist stets der jeweilige Anbieter oder Betreiber der Seiten verantwortlich. Die verlinkten Seiten wurden zum Zeitpunkt der Verlinkung auf mögliche Rechtsverstöße überprüft; rechtswidrige Inhalte waren zum Zeitpunkt der Verlinkung nicht erkennbar. Eine permanente inhaltliche Kontrolle der verlinkten Seiten ist ohne konkrete Anhaltspunkte einer Rechtsverletzung nicht zumutbar. Bei Bekanntwerden von Rechtsverletzungen entferne ich derartige Links umgehend.",
    copyrightTitle: "Urheberrecht",
    copyrightBody:
      "Die durch den Seitenbetreiber erstellten Inhalte und Werke auf diesen Seiten unterliegen dem deutschen Urheberrecht. Die Vervielfältigung, Bearbeitung, Verbreitung und jede Art der Verwertung außerhalb der Grenzen des Urheberrechtes bedürfen der schriftlichen Zustimmung des jeweiligen Autors bzw. Erstellers. Downloads und Kopien dieser Seite sind nur für den privaten, nicht kommerziellen Gebrauch gestattet. Soweit die Inhalte auf dieser Seite nicht vom Betreiber erstellt wurden, werden die Urheberrechte Dritter beachtet und als solche gekennzeichnet.",
  },
  privacyPolicy: {
    metaTitle: "Datenschutz | DepotWatch Orange",
    title: "Datenschutzerklärung",
    controllerTitle: "Verantwortlicher im Sinne der DSGVO",
    controllerBody:
      "Marcus Gerhardy\nAzaleenring 72\n49744 Geeste\nDeutschland\n\nE-Mail: marcus.gerhardy@googlemail.com\n\nEin Datenschutzbeauftragter ist nicht bestellt; die Voraussetzungen des Art. 37 DSGVO und des § 38 BDSG liegen nicht vor.",
    noStorageTitle: "Keine Speicherung von Nutzerdaten",
    noStorageBody:
      "DepotWatch Orange ist eine reine Client-Anwendung. Alle Portfoliodaten liegen ausschließlich in einer lokalen, passwortverschlüsselten Datei auf deinem Gerät. Es gibt keinen Server, der Nutzerdaten speichert, kein Konto und kein Tracking (keine Cookies, keine Analyse-Tools). Deine Portfoliodaten verlassen dein Gerät nicht: Sie werden weder an mich noch an Dritte übermittelt, und ich habe zu keinem Zeitpunkt Zugriff darauf.",
    hostingTitle: "Hosting und Server-Logfiles",
    hostingBody:
      "Die Seite wird bei der Vercel Inc., USA, gehostet (vercel.com). Beim Abruf der Seite verarbeitet der Anbieter technisch notwendige Zugriffsdaten in Server-Logfiles: IP-Adresse, Datum und Uhrzeit des Abrufs, abgerufene Datei, Referrer, Browsertyp und Betriebssystem. Diese Verarbeitung ist für die Auslieferung der Seite technisch erforderlich und dient dem sicheren und stabilen Betrieb.\n\nRechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO; das berechtigte Interesse liegt im technisch fehlerfreien und sicheren Betrieb der Seite. Mit dem Anbieter besteht ein Vertrag über die Auftragsverarbeitung nach Art. 28 DSGVO. Soweit dabei personenbezogene Daten in die USA übermittelt werden, stützt sich die Übermittlung auf einen Angemessenheitsbeschluss nach Art. 45 DSGVO (EU-US Data Privacy Framework) beziehungsweise auf Standardvertragsklauseln nach Art. 46 Abs. 2 lit. c DSGVO.",
    externalTitle: "Abfragen an externe Dienste",
    externalIntro:
      "Bei Nutzung der App werden zur Laufzeit Daten von externen Schnittstellen abgerufen. Dabei erhält der jeweilige Anbieter technisch bedingt deine IP-Adresse und die Anfragedaten. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO: Ohne diese Abrufe könnte die App weder Kurse noch On-Chain-Daten anzeigen.",
    externalBinance: "Binance (Kursdaten): Es werden keine Portfoliodaten übermittelt.",
    externalExplorer:
      "mempool.space / blockstream.info (On-Chain-Daten): Übermittelt werden die von dir zur Beobachtung eingetragenen Bitcoin-Adressen. In den Einstellungen kann stattdessen ein eigener Server konfiguriert werden.",
    externalOutro:
      "Diese Abrufe finden nur statt, wenn du die entsprechende Funktion nutzt. Die Schriftarten und das Bitcoin-Whitepaper werden von dieser Seite selbst ausgeliefert, es wird also kein CDN und kein Font-Dienst eines Dritten angefragt.",
    rightsTitle: "Deine Rechte",
    rightsBody:
      "Dir stehen gegenüber dem Verantwortlichen die Rechte auf Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18), Datenübertragbarkeit (Art. 20) und Widerspruch gegen eine Verarbeitung auf Grundlage berechtigter Interessen (Art. 21) zu.\n\nIn der Praxis liegen mir zu dir keine Daten vor, aus denen sich Auskunft erteilen ließe: Es gibt kein Konto und keine serverseitige Speicherung. Deine Portfoliodatei liegt auf deinem Gerät und untersteht allein dir; löschen kannst du sie, indem du die Datei löschst.\n\nUnabhängig davon steht dir ein Beschwerderecht bei einer Aufsichtsbehörde zu (Art. 77 DSGVO), für Niedersachsen: Die Landesbeauftragte für den Datenschutz Niedersachsen, Prinzenstraße 5, 30159 Hannover.",
  },
  help: {
    metaTitle: "Hilfe | DepotWatch Orange",
    title: "Hilfe",
    path: "/hilfe",
    intro:
      "Wie die App bedient wird, nach Themen sortiert. Das Sicherheitskonzept dahinter steht auf „So funktioniert's\u201c; hier geht es um die Handgriffe.",
    topics: "Themen",
    onThisPage: "Auf dieser Seite",
    searchLabel: "Hilfe durchsuchen",
    searchPlaceholder: "Suchen …",
    results: "{count} Treffer",
    noResults: "Nichts gefunden für „{query}\u201c.",
    about: "Hilfe zu diesem Bereich",
    aboutLabel: "Hilfe zu: {what}",
    openFull: "Als Seite öffnen",
  },
  notFound: {
    title: "Diese Seite gibt es nicht.",
    body:
      "Der Link ist vermutlich veraltet oder vertippt. Deine Portfolio-Datei ist davon nicht betroffen: Sie liegt auf deinem Gerät, nicht hier.",
    home: "Zur App",
  },
  nav: {
    dashboard: "Dashboard",
    transactions: "Transaktionen",
    tax: "Steuer",
    watchlist: "Watchlist",
    milestones: "Meilensteine",
    settings: "Einstellungen",
    menu: "Menü",
    privacyMode: "Privacy-Modus (Beträge ausblenden)",
    saveFile: "Datei speichern",
    unsavedChanges: "Ungespeicherte Änderungen",
    saved: "Gespeichert",
    lastSavedAt: "Zuletzt gespeichert: {time}",
    notYetSaved: "Noch nicht gespeichert",
    encrypted: "Verschlüsselt (AES-256-GCM)",
    unencrypted: "Unverschlüsselt",
    closeFile: "Datei schließen",
    closeFileConfirm:
      "Datei schließen? Ungespeicherte Änderungen gehen verloren (im automatischen Modus ist bereits alles gespeichert).",
    closeFileConfirmDemo:
      "Datei schließen? Diese Testdaten wurden noch nie gespeichert. Alle Änderungen gehen verloren.",
    setUpFile: "Testdaten speichern",
  },
  dashboard: {
    holdings: "Bestand",
    price: "BTC-Kurs",
    priceUnavailable: "Kurs nicht verfügbar",
    realizedPnl: "Realisierter G/V",
    avgCost: "Ø Einstandspreis",
    costBasis: "Einstandswert",
    wallet: "Wallet",
    account: "Konto",
    chartPortfolio: "Portfoliowert",
    chartBtcPrice: "BTC-Kurs",
    uncoveredHint:
      "Für {amount} aus Verkäufen, Ausgaben oder Abgängen fehlen die zugehörigen Käufe im Portfolio (z. B. bei einem CSV-Export, der erst mitten in der Historie beginnt). Der Bestand oben stimmt, aber Einstandswert, Ø Einstandspreis und unrealisierter G/V sind unvollständig.",
    breakdownIntro:
      "Jede Zeile enthält die BTC-Gebühren ihrer Transaktionen bereits: ein Kauf zählt Menge minus Gebühr, Verkauf, Ausgabe und Transfer-Ausgang zählen Menge plus Gebühr (siehe Gebührenkonvention). Ein Transfer zwischen eigenen Konten kostet also genau die Netzwerkgebühr.",
    breakdownBuys: "Käufe",
    breakdownTransferIns: "Transfers (Eingang)",
    breakdownSells: "Verkäufe",
    breakdownTransferOuts: "Transfers (Ausgang)",
    breakdownSpends: "Ausgaben",
    breakdownFees: "davon BTC-Gebühren",
    breakdownTotal: "Bestand",
    invalidAmountHint:
      "{count} Transaktion(en) haben eine Menge oder BTC-Gebühr, die keine Zahl ist. Solche Werte zählen als 0 und verfälschen den Bestand.",
    negativeBalanceHint:
      "Der Gesamtbestand ist negativ: Es wurden mehr Verkäufe, Ausgaben und Abgänge erfasst als Käufe und Zugänge. Bitte die Transaktionen prüfen.",
    chartCompare: "Mit BTC-Kurs vergleichen",
    chartEmpty: "Noch keine Transaktionen. Der Wertverlauf erscheint hier.",
    showTransactions: "Transaktionen dieses Kontos anzeigen",
    range90: "90 T",
    range365: "1 J",
    rangeAll: "Alles",
    widgets: {
      pickerTitle: "Widget hinzufügen",
      pickerIntro:
        "Wähle ein Widget für den freien Platz. Die Kennzeichnung zeigt, woher ein Widget seine Daten bezieht.",
      alreadyPlaced: "bereits platziert",
      addWidget: "Widget",
      addHere: "Widget an dieser Stelle hinzufügen",
      remove: "Widget entfernen",
      crashed: "Dieses Widget konnte nicht dargestellt werden.",
      resetLayout: "Layout zurücksetzen",
      resetConfirm:
        "Layout auf den Auslieferungszustand zurücksetzen? Deine Anordnung geht dabei verloren.",
      doneEditing: "Fertig",
      editHint:
        "Bearbeiten aktivieren, um Widgets zu verschieben, in der Größe zu ändern, hinzuzufügen oder zu entfernen.",
      emptyDashboard: "Dein Dashboard ist leer.",
      sources: {
        ledger: "nur lokale Daten",
        price: "Kurs (Binance)",
        priceHistory: "Kurshistorie (Binance)",
        explorer: "Explorer",
      },
      change24h: "24 Std.",
      change7d: "7 Tage",
      change30d: "30 Tage",
      unrealizedAgainstCost: "unrealisiert gegenüber Einstandskosten",
      pnlCoveredBtc: "Davon bewertet",
      pnlWithoutBasisHint:
        "{amount} deines Bestands haben keinen Einstandswert, etwa Zugänge von außen ohne Kurs. Diese Menge steckt weder im Einstandswert noch im Gewinn, sonst würde ihr voller Kurswert als Gewinn erscheinen.",
      // --- Neue Widgets ---------------------------------------------------
      taxFreeEmpty: "Keine offenen Lots.",
      taxFreeProceedsLabel: "Steuerfrei realisierbar (aktueller Kurs)",
      taxFreeShare: "Anteil des Bestands außerhalb der Haltefrist",
      taxFreeAmount: "Menge ({unit})",
      taxFreeLots: "Betroffene Lots",
      taxFreeLocked: "Noch in der Haltefrist ({unit})",
      taxFreeUnresolved: "Nicht bewertbar, Herkunft ungeklärt ({count})",
      taxDisclaimer:
        "Unverbindliche Berechnung nach den hinterlegten Einstellungen. Ersetzt keine Steuerberatung.",
      exemptionRealized: "Realisierte steuerpflichtige Gewinne {year}",
      exemptionLimitLabel: "Freigrenze",
      exemptionHeadroom: "Verbleibender Spielraum",
      exemptionOver: "Überschritten um",
      exemptionDisposals: "Veräußerungen im Jahr",
      exemptionTaxFreeGain: "Davon steuerfrei (nach Haltefrist)",
      exemptionUnresolved: "BTC mit ungeklärter Herkunft",
      exemptionIsLimitNotAllowance:
        "Freigrenze, kein Freibetrag: Wird sie auch nur um einen Euro überschritten, ist der gesamte Gewinn steuerpflichtig, nicht nur der übersteigende Teil.",
      exemptionAsOf: "Stand {date}",
      stackHistoryEmpty: "Noch keine Transaktionen.",
      stackSince: "Bestand seit {date}",
      stackAmount: "Bestand",
      heatmapSummary: "In den letzten 12 Monaten, {count} Käufe",
      heatmapCell: "ein Feld = ein Tag",
      heatmapEmpty: "Noch keine Käufe in den letzten 12 Monaten.",
      heatmapLess: "weniger",
      heatmapMore: "mehr",
      heatmapFooter: "An {days} Tagen gekauft, zusammen {amount}",
      heatmapBuys: "· {count} Kauf/Käufe",
      heatmapNoBuy: "· kein Kauf",
      heatmapPerBtc: " je BTC",
      feesEmpty: "Noch keine Transaktionen.",
      feesPaid: "Gezahlte Gebühren gesamt",
      feesOfInvested: "der Investitionssumme",
      feesTrading: "Handelsgebühren",
      feesNetwork: "Netzwerkgebühren",
      feesBtc: "Davon in BTC gezahlt",
      feesInvested: "Investitionssumme",
      feesUnvalued:
        "Für {amount} Gebühren gibt es keinen Tageskurs, sie fehlen daher in der Summe.",
      feesNoHistory: "Kurshistorie nicht erreichbar, BTC-Gebühren bleiben unbewertet.",
      whatIfEmpty: "Keine Positionen mit bekanntem Einstandswert.",
      whatIfValue: "Portfoliowert bei diesem Kurs",
      whatIfMultiple: "{multiple}× des aktuellen Kurses",
      whatIfPrice: "Angenommener BTC-Kurs",
      whatIfPnl: "Gewinn/Verlust gegenüber Einstand",
      whatIfValued: "Davon bewertet",
      whatIfReset: "aktueller Kurs",
      blockEpoch: "Epoche {epoch} · {blocks} Blöcke",
      blockAsOf: "Stand {time}",
      watchlistEmpty: "Noch keine beobachteten Adressen.",
      utxoCountLabel: "UTXOs auf {addresses} Adressen",
      utxoTotal: "Gesamtwert",
      utxoDust: "Dust-UTXOs",
      utxoConsolidatable: "Konsolidierbar (< 0,001 BTC)",
      utxoConsolidationCost: "Kosten einer Zusammenlegung",
      utxoConsolidateNow:
        "Gebühren sind niedrig: guter Moment, um die {count} kleinen UTXOs zusammenzulegen.",
      utxoConsolidateWait:
        "Gebühren sind erhöht. Mit dem Zusammenlegen lieber auf günstigere Blöcke warten.",
      toWatchlist: "Zur Watchlist",
      watchlistFindings: "Offene Warnungen auf {addresses} Adressen",
      watchlistClean: "Keine Auffälligkeiten gefunden.",
      watchlistScore: "Ø Privacy Score",
      watchlistSkipped: "Nicht abfragbar (xpub)",
      finding: {
        addressReuse: "Adress-Wiederverwendung",
        pubkeyLeaked: "Public Key sichtbar",
        legacyFormat: "Veraltetes Adressformat",
        possiblePoisoning: "Address-Poisoning-Verdacht",
        dustUtxo: "Dust-UTXOs",
        roundAmounts: "Auffällig runde Beträge",
      },
      timeInMarketEmpty: "Noch kein Kauf erfasst.",
      daysInMarket: "Tage im Markt",
      yearsInMarket: "{years} Jahre",
      firstBuy: "Erster Kauf",
      buysPerYear: "Käufe pro Jahr",
      maxDrawdown: "Maximaler Drawdown",
      drawdownDetail: "Von {peak} auf {trough} am {date}",
      markerBucket: {
        week: "Marker je Woche zusammengefasst ({count} Trades im Zeitraum)",
        month: "Marker je Monat zusammengefasst ({count} Trades im Zeitraum)",
      },
      markerWithoutPrice: "{count} Trade(s) ohne erfassten Kurs, nicht im Chart",
      markerOutsideHistory: "{count} Trade(s) vor Beginn der verfügbaren Kurshistorie",
      markerTipTrades: "Trades",
      markerTipAmount: "Menge",
      markerTipValue: "Wert",
      markerTipAvgPrice: "Ø Kurs",
      markerTipPeriod: "{from} bis {to}",
      spotPriceSource: "Aktueller Kurs (Binance)",
      moscowTime: "Moscow Time",
      moscowTimeSats: "{sats} Sats je Dollar",
      moscowTimeHint:
        "Moscow Time: wie viele Sats ein US-Dollar kauft, als Uhrzeit gelesen (2.000 Sats = 20:00). Nur eine andere Schreibweise des Kurses, per Konvention immer in Dollar.",
      sats: "Sats im Bestand",
      nextMilestone: "Nächster Meilenstein",
      satsToGo: "Noch {amount} Sats",
      wholecoinerReached: "Wholecoiner erreicht",
      ofOneBtc: "{percent} von einem ganzen Bitcoin",
      milestone001: "0,01 BTC",
      milestone01: "0,1 BTC",
      milestone05: "0,5 BTC",
      milestoneWholecoiner: "1 BTC (Wholecoiner)",
      avgCostUnknown:
        "Ohne Einstandskurs oder aktuellen Kurs lässt sich der Abstand nicht berechnen.",
      distance: "Abstand",
      oneBtc: "1 BTC = 1 BTC",
      pizzaDay: "Bitcoin Pizza Day: {pizzas} Pizzen zum Kurs von 2010 (10.000 BTC für zwei)",
      sovereignBadge: "Not your keys, not your coins. Deine schon.",
      sovereignHint: "Kein Anteil des Bestands liegt auf einer Börse.",
      feeMood: {
        veryLow: "Sehr günstige Blöcke: guter Moment, um UTXOs zu konsolidieren.",
        low: "Günstig. Größere Transaktionen kosten gerade wenig.",
        normal: "Normale Auslastung.",
        high: "Erhöhte Gebühren: Unwichtiges kann warten.",
        veryHigh: "Sehr teure Blöcke. Wenn es nicht eilt: später senden.",
      },
      onExchanges: "auf Börsen",
      selfCustody: "Eigenverwahrung",
      exchangeWarning:
        "Bitcoin auf einer Börse gehört dir nur als Forderung. Für den langfristigen Bestand ist Eigenverwahrung sicherer.",
      backupOk: "Backup verifiziert: {when}",
      backupUnverified: "Backup vom {when} nicht verifiziert",
      backupNever: "Noch kein verifiziertes Backup",
      yearInReviewEmpty: "Noch kein abgeschlossenes Jahr im Bestand.",
      yearInReviewStacked: "Netto gestapelt in {year}",
      custodyEmpty: "Noch kein Bestand vorhanden.",
      taxFreeNow: "Aktuell steuerfrei verfügbar",
      allTaxFree: "Der gesamte Bestand ist steuerfrei.",
      taxFreeFrom: "Steuerfrei ab",
      daysLeft: "Tage",
      holdingPeriodUnresolved:
        "{amount} ohne auflösbare Herkunft: für sie lässt sich keine Haltefrist bestimmen.",
      holdingPeriodEmpty: "Keine offenen Lots vorhanden.",
      dataQualityClean: "Keine offenen Punkte gefunden.",
      showAffected: "Betroffene Transaktionen anzeigen",
      issues: {
        unlinkedTransfer: "Transfers ohne Gegenstück",
        unresolvedOrigin: "Eingänge mit ungeklärter Herkunft",
        incompleteAllocation: "Verkäufe/Ausgaben/Transfers ohne vollständige Lot-Zuordnung",
        missingTxid: "Transfers ohne Txid",
        missingEurValue: "Transaktionen ohne EUR-Bewertung",
      },
      entries: "Käufe",
      exits: "Verkäufe",
      dcaEmpty: "Noch keine Käufe erfasst.",
      avgPerMonth: "Durchschnitt pro Monat",
      buyCount: "Käufe",
      avgInterval: "Rhythmus",
      everyNDays: "alle {days} Tage",
      totalInvested: "Investiert",
      cumulativeBtc: "Kumuliert",
      explorerUnavailable:
        "Die Explorer-Quelle ({endpoint}) ist nicht erreichbar.",
      feeFastest: "Nächster Block",
      feeHalfHour: "Halbe Stunde",
      feeHour: "Eine Stunde",
      feeEconomy: "Günstig",
      daysValue: "{days} Tage",
      untilHalving: "bis zum nächsten Halving",
      blockHeight: "Blockhöhe",
      blocksToGo: "Verbleibende Blöcke",
      halvingBlock: "Halving bei Block",
      halvingEstimateHint:
        "Schätzung auf Basis von zehn Minuten pro Block. Die tatsächliche Dauer hängt von der Hashrate ab.",
      yearInReview: {
        title: "Jahresrückblick",
        description: "Das letzte abgeschlossene Jahr in wenigen Zahlen.",
      },
      milestones: {
        title: "Meilensteine",
        description: "Die zuletzt erreichten Meilensteine und der Gesamtstand.",
      },
      taxFreeProceeds: {
        title: "Steuerfrei realisierbar",
        description:
          "Was aktuell außerhalb der Haltefrist liegt, zum aktuellen Kurs bewertet.",
      },
      exemptionLimit: {
        title: "Freigrenzen-Tracker",
        description:
          "Realisierte Gewinne des laufenden Jahres gegen die Freigrenze aus den Einstellungen.",
      },
      stackHistory: {
        title: "Stack-Entwicklung",
        description: "Die reine BTC-Menge über die Zeit, unabhängig vom Kurs.",
      },
      buyHeatmap: {
        title: "Kauf-Heatmap",
        description: "Zwölf Monate Käufe als Kalender, Intensität nach Volumen.",
      },
      feeBalance: {
        title: "Gebührenbilanz",
        description:
          "Alle gezahlten Gebühren in EUR, aufgeteilt in Handel und Netzwerk.",
      },
      whatIf: {
        title: "Was wäre wenn",
        description: "Portfoliowert und Gewinn bei einem frei gewählten BTC-Kurs.",
      },
      timeInMarket: {
        title: "Zeit im Markt",
        description: "Tage seit dem ersten Kauf und der tiefste Rückgang seither.",
      },
      blockClock: {
        title: "Blockzeit",
        description: "Die aktuelle Blockhöhe, groß und ohne Beiwerk.",
      },
      utxoOverview: {
        title: "UTXO-Übersicht",
        description:
          "UTXOs der Watchlist, Dust und was eine Zusammenlegung kosten würde.",
      },
      watchlistStatus: {
        title: "Watchlist-Status",
        description: "Beobachtete Adressen und offene Sicherheitswarnungen.",
      },
      portfolioValue: {
        title: "Portfoliowert",
        description:
          "Gesamtwert in der Anzeigewährung, mit Veränderung über 24 Stunden, 7 und 30 Tage.",
      },
      pnl: {
        title: "Gewinn / Verlust",
        description:
          "Unrealisiert gegenüber den Einstandskosten, realisierte Gewinne separat.",
      },
      btcPrice: {
        title: "BTC-Kurs",
        description: "Aktueller Kurs von Binance in EUR und USD, dazu die Moscow Time.",
      },
      holdingPeriod: {
        title: "Haltefrist",
        description:
          "Welche Lots steuerfrei sind, welche wann folgen, und wie viel BTC aktuell steuerfrei verfügbar ist.",
      },
      satsStack: {
        title: "Sats-Stack",
        description: "Bestand in Sats mit Fortschritt zum nächsten Meilenstein.",
      },
      avgCost: {
        title: "Einstandspreis",
        description:
          "Durchschnittlicher Einstandskurs gegenüber dem aktuellen Kurs, mit sichtbarem Abstand.",
      },
      custody: {
        title: "Verwahrung",
        description:
          "Anteil auf Börsen gegenüber Eigenverwahrung, der Börsenanteil als Warnwert.",
      },
      priceEntries: {
        title: "Kursverlauf mit Ein- und Ausstiegen",
        description:
          "BTC-Kursverlauf, in dem deine Käufe und Verkäufe als Marker eingezeichnet sind.",
      },
      networkFees: {
        title: "Netzwerkgebühren",
        description:
          "Aktuelle Gebührensätze in sat/vB über die eingestellte Explorer-Quelle.",
      },
      halving: {
        title: "Halving-Countdown",
        description:
          "Blockhöhe, verbleibende Blöcke sowie geschätzte Tage bis zum nächsten Halving.",
      },
      dataQuality: {
        title: "Datenqualität",
        description:
          "Offene Punkte im Bestand, jeweils mit Sprung in die gefilterte Transaktionsübersicht.",
      },
      dca: {
        title: "DCA-Überblick",
        description:
          "Kaufrhythmus, Durchschnittsbetrag pro Monat sowie die kumulierte Menge über die Zeit.",
      },
      portfolioChart: {
        title: "Wertverlauf",
        description:
          "Entwicklung des Portfoliowerts über die Zeit, optional im Vergleich zum BTC-Kurs.",
      },
      walletBreakdown: {
        title: "Wallets und Konten",
        description: "Bestand je Wallet-Konto, ein Klick öffnet die Transaktionen.",
      },
      holdingComposition: {
        title: "Zusammensetzung des Bestands",
        description:
          "Aus welchen Käufen, Verkäufen, Transfers sowie Gebühren sich der Bestand ergibt.",
      },
    },
  },
  wallets: {
    title: "Wallets & Konten",
    addWallet: "Wallet hinzufügen",
    addAccount: "Konto hinzufügen",
    walletName: "Wallet-Name",
    walletNamePlaceholder: "Börse",
    accountName: "Konto-Name",
    type: "Typ",
    types: {
      exchange: "Börse",
      hardware: "Hardware Wallet",
      software: "Software Wallet",
      paper: "Paper Wallet",
    },
    rename: "Umbenennen",
    deleteWalletConfirm:
      "Wallet „{name}“ inkl. aller Konten und Transaktionen löschen?",
    deleteAccountConfirm:
      "Konto „{name}“ inkl. aller Transaktionen löschen?",
    empty: "Noch keine Wallets. Lege zuerst ein Wallet mit einem Konto an.",
  },
  celebration: {
    wholecoinerTitle: "Ein ganzer Coin.",
    wholecoinerBody: "Dein Bestand hat 1,00000000 BTC erreicht.",
  },
  easterEggs: {
    laserEyesUnlocked: "Laseraugen freigeschaltet. Abschaltbar in den Einstellungen.",
  },
  milestones: {
    title: "Meilensteine",
    intro:
      "Meilensteine halten Entscheidungen fest, die du getroffen hast: gestapelt, selbst verwahrt, durchgehalten, sauber geführt. Nie den Kursverlauf, denn steigende Kurse sind keine Leistung, sondern Wetter. Es gibt keine Serien, die man verlieren kann, und keinen Vergleich mit anderen: Die App hat nie jemand anderen gesehen.",
    reached: "Meilenstein erreicht",
    andMore: "und {count} weitere",
    open: "offen",
    overall: "Insgesamt erreicht",
    showAll: "Alle Meilensteine",
    widgetEmpty: "Noch keine Meilensteine erreicht.",
    daysProgress: "{current} von {target} Tagen",
    categories: {
      stacking: "Stapeln",
      sovereignty: "Souveränität",
      patience: "Geduld",
      diligence: "Sorgfalt",
      culture: "Kultur",
    },
    catalog: {
      firstTransaction: {
        title: "Der Anfang",
        description:
          "Die erste Transaktion ist erfasst.",
      },
      sats100k: {
        title: "100.000 Sats",
        description:
          "Ein Zehntausendstel Bitcoin im Bestand.",
      },
      sats1m: {
        title: "1.000.000 Sats",
        description:
          "Eine Million Sats, für viele die erste runde Marke.",
      },
      btc010: {
        title: "0,1 BTC",
        description:
          "Ein Zehntel Bitcoin im Bestand.",
      },
      btc021: {
        title: "0,21 BTC",
        description:
          "Ein Prozent von 21, der Zahl, um die sich alles dreht.",
      },
      btc1: {
        title: "Wholecoiner",
        description:
          "Ein ganzer Bitcoin im Bestand.",
      },
      btc21: {
        title: "2,1 BTC",
        description:
          "Zehn Prozent von 21.",
      },
      firstWithdrawal: {
        title: "Von der Börse geholt",
        description:
          "Zum ersten Mal Bitcoin von einer Börse in eine eigene Wallet überführt.",
      },
      selfCustody50: {
        title: "Die Hälfte selbst verwahrt",
        description:
          "Mindestens 50 % des Bestands liegen in eigener Verwahrung.",
      },
      selfCustody100: {
        title: "Vollständig selbst verwahrt",
        description:
          "Kein Anteil des Bestands liegt mehr auf einer Börse.",
      },
      firstWatchedAddress: {
        title: "Erste beobachtete Adresse",
        description:
          "Eine Adresse in die Watchlist aufgenommen.",
      },
      taprootAddress: {
        title: "Taproot",
        description:
          "Eine Taproot-Adresse (bc1p…) erfasst.",
      },
      lightningWallet: {
        title: "Lightning",
        description:
          "Eine Lightning-Wallet angelegt.",
      },
      firstTaxFreeLot: {
        title: "Erstes Lot über der Jahresfrist",
        description:
          "Ein Lot hat die einjährige Haltefrist überschritten.",
      },
      days100: {
        title: "100 Tage dabei",
        description:
          "Seit dem ersten Kauf sind 100 Tage vergangen.",
      },
      year1: {
        title: "Ein Jahr dabei",
        description:
          "Seit dem ersten Kauf ist ein Jahr vergangen.",
      },
      throughHalving: {
        title: "Durch ein Halving gehalten",
        description:
          "Über einen Halving-Termin hinweg Bestand gehalten.",
      },
      years4: {
        title: "Ein voller Zyklus",
        description:
          "Vier Jahre seit dem ersten Kauf.",
      },
      firstBackup: {
        title: "Erstes Backup",
        description:
          "Das Portfolio liegt als Datei gesichert vor.",
      },
      encrypted: {
        title: "Verschlüsselt",
        description:
          "Die Portfolio-Datei ist mit einem Passwort verschlüsselt.",
      },
      allTransfersLinked: {
        title: "Alle Transfers verknüpft",
        description:
          "Jeder Transfer hat sein Gegenstück, keine offenen Enden.",
      },
      allTxidsRecorded: {
        title: "Alle Txids erfasst",
        description:
          "Jede Transfer-Transaktion trägt ihre On-Chain-Id.",
      },
      taxExported: {
        title: "Steuerauswertung exportiert",
        description:
          "Eine Jahresauswertung als Datei erzeugt.",
      },
      taxYearClosed: {
        title: "Steuerjahr abgeschlossen",
        description:
          "Ein abgelaufenes Jahr ist vollständig zugeordnet.",
      },
      whitepaperOpened: {
        title: "Whitepaper gelesen",
        description:
          "Die neun Seiten geöffnet, die alles gestartet haben.",
      },
      firstConsolidation: {
        title: "Aufgeräumt",
        description:
          "Mehrere Lots in einer Transaktion zusammengeführt.",
      },
      boughtOnHalvingDay: {
        title: "Am Halving gekauft",
        description:
          "An einem Halving-Tag nachgelegt.",
      },
      boughtOnPizzaDay: {
        title: "Pizza Day",
        description:
          "Am 22. Mai gekauft, dem Tag der zwei teuersten Pizzen der Geschichte.",
      },
    },
  },
  yearInReview: {
    title: "Jahresrückblick",
    intro:
      "Was du in einem Jahr getan hast: gekauft, gehalten, in die eigene Verwahrung geholt, Gebühren gezahlt. Keine Bewertung deiner Kurse: was der Markt gemacht hat, war nicht deine Entscheidung.",
    open: "Jahresrückblick ansehen",
    noYears: {
      title: "Noch kein Jahr zum Zurückblicken.",
      body:
        "Einen Rückblick gibt es erst, wenn ein Jahr vorbei ist. {year} läuft noch, deshalb wäre jede Zahl darüber nur eine Zwischenmeldung.",
    },
    yearLabel: "Jahr",
    step: "{current} von {total}",
    next: "Weiter",
    back: "Zurück",
    empty: {
      title: "In {year} ist hier nichts passiert.",
      body:
        "Für dieses Jahr sind keine Transaktionen erfasst. Wähle oben ein anderes Jahr, vergangene Jahre bleiben jederzeit abrufbar.",
    },
    summary: {
      label: "Gesamtübersicht",
      sentence: "{count} Transaktionen in diesem Jahr. Jede Kennzahl führt zurück auf ihre Karte.",
    },
    market: {
      missing:
        "Für den Vergleich mit dem Jahresdurchschnitt fehlen historische Kurse. Sie werden nur auf ausdrückliche Anforderung geladen.",
      load: "Kursdaten laden",
      loading: "Wird geladen …",
      error: "Kursdaten konnten nicht geladen werden.",
    },
    cards: {
      stacked: {
        label: "Netto gestapelt",
        sentence: "Dein Bestand ist in diesem Jahr um diesen Betrag gewachsen, aus {buys} Käufen. Überträge zwischen deinen eigenen Wallets sind herausgerechnet.",
        sentenceNoBuys: "So viel hat sich dein Bestand in diesem Jahr netto verändert. Überträge zwischen deinen eigenen Wallets sind herausgerechnet.",
        buys: "Käufe",
        inSats: "In Sats",
        growth: "Veränderung zum Jahresanfang",
      },
      invested: {
        label: "Investiert",
        sentence: "So viel Euro sind in {buys} Käufen zusammengekommen, Handelsgebühren eingerechnet.",
        perBuy: "Durchschnitt je Kauf",
        withoutEur: "Käufe ohne EUR-Angabe",
      },
      avgPrice: {
        label: "Dein Durchschnittskurs",
        sentenceBelow: "Mengengewichtet über deine Käufe. Das sind {percent} unter dem Jahresdurchschnitt des Kurses.",
        sentenceAbove: "Mengengewichtet über deine Käufe. Das sind {percent} über dem Jahresdurchschnitt des Kurses.",
        sentenceNoMarket: "Mengengewichtet über deine Käufe: der Kurs, zu dem du im Schnitt tatsächlich gekauft hast.",
        market: "Jahresdurchschnitt BTC",
        marketDays: "Tage mit Kursdaten",
      },
      priceRange: {
        label: "Gezahlte Kursspanne",
        sentence: "Zwischen diesen beiden Kursen lagen deine {buys} Käufe des Jahres.",
        spread: "Abstand",
      },
      rhythm: {
        label: "Aktivster Monat",
        sentence: "In diesem Monat hast du {buys} Mal gekauft. Dein häufigster Wochentag war {weekday}.",
        monthAmount: "Menge in diesem Monat",
        weekdayBuys: "Käufe an diesem Wochentag",
      },
      streak: {
        label: "Längste Kaufserie",
        value: {
          weeks: "{count} Wochen",
          months: "{count} Monate",
        },
        sentence: "So lange am Stück hast du in diesem Jahr ohne Unterbrechung gekauft.",
      },
      fees: {
        label: "Gezahlte Gebühren",
        sentence: "Handels- und Netzwerkgebühren zusammen, {percent} des investierten Betrags.",
        sentenceNoShare: "Handels- und Netzwerkgebühren dieses Jahres zusammen.",
        trading: "Handelsgebühren",
        network: "Netzwerkgebühren",
        unvalued: "BTC-Gebühren ohne Tageskurs",
      },
      taxFree: {
        label: "Haltefrist überschritten",
        sentence: "Diese Menge aus {lots} Positionen hat in diesem Jahr die Jahresfrist überschritten und wird noch gehalten.",
        unresolved: "Herkunft ungeklärt (nicht bewertbar)",
        disclaimer:
          "Herkunft und Haltefrist stammen aus den zugeordneten Ursprungskäufen. Positionen ohne geklärte Herkunft sind hier nicht enthalten. Keine Steuerberatung.",
      },
      realized: {
        label: "Realisiert",
        sentence: "Aus {count} Verkäufen bzw. Ausgaben in diesem Jahr.",
        taxable: "davon steuerpflichtig",
        taxFree: "davon steuerfrei",
        unresolved: "Herkunft ungeklärt (nicht bewertbar)",
        disclaimer:
          "Gewinne nach FIFO über die zugeordneten Ursprungskäufe. Keine Steuerberatung.",
      },
      custody: {
        label: "In Eigenverwahrung",
        sentence: "Anteil deines Bestands am Jahresende, der nicht auf einer Börse lag. {count} Überträge gingen in diesem Jahr von einer Börse in eine eigene Wallet.",
        moved: "Davon bewegt",
      },
      milestones: {
        label: "Meilensteine erreicht",
        sentence: "In diesem Jahr dazugekommen.",
      },
      closing: {
        label: "Bestand am Jahresende",
        sentence: "Stand nach dem letzten Tag des Jahres {year}.",
        inSats: "In Sats",
        start: "Am Jahresanfang",
      },
    },
    share: {
      title: "Als Bild teilen",
      localOnly:
        "Das Bild wird vollständig in deinem Browser erzeugt. Nichts wird hochgeladen, kein Server und kein externer Dienst ist beteiligt.",
      absolute: "Absolute Beträge einblenden",
      absoluteHint:
        "{count} Angaben mit absoluten Beträgen sind ausgeblendet. Geteilt werden nur relative Angaben: Anzahl, Prozent, Durchschnittskurs.",
      absoluteWarning:
        "Achtung: Das Bild nennt jetzt deine tatsächliche Bestandsgröße und deine Beträge. Wer es sieht, weiß, wie viel Bitcoin du besitzt. Das ist ein Sicherheitsrisiko für dich persönlich, nicht nur eine Datenschutzfrage.",
      privacyBlocked:
        "Der Privacy-Modus ist aktiv. Solange er läuft, können keine absoluten Beträge in ein Bild geschrieben werden.",
      preview: "Das steht im Bild:",
      download: "Als PNG speichern",
      fileName: "jahresrueckblick-{year}.png",
      imageTitle: "Jahresrückblick {year}",
      imageFooter: "Lokal erzeugt · DepotWatch Orange",
      buys: "Käufe",
      growth: "Bestandsveränderung",
      stacked: "Netto gestapelt",
      invested: "Investiert",
      avgPrice: "Dein Durchschnittskurs",
      vsMarket: "Zum Jahresdurchschnitt",
      priceRange: "Gezahlte Kursspanne",
      busiestMonth: "Aktivster Monat",
      busiestWeekday: "Häufigster Wochentag",
      streak: {
        weeks: "Längste Serie (Wochen)",
        months: "Längste Serie (Monate)",
      },
      feeShare: "Gebührenanteil",
      fees: "Gebühren",
      taxFree: "Haltefrist überschritten",
      realized: "Realisiert",
      custody: "In Eigenverwahrung",
      milestones: "Meilensteine",
      closing: "Bestand am Jahresende",
    },
    hint: {
      body: "Dein Jahresrückblick für {year} ist fertig.",
      open: "Rückblick {year} ansehen",
      dismiss: "Hinweis ausblenden",
    },
  },
  tx: {
    title: "Transaktionen",
    titleCount: "{filtered} von insgesamt {total}",
    add: "Transaktion erfassen",
    edit: "Transaktion bearbeiten",
    date: "Datum",
    time: "Uhrzeit",
    type: "Typ",
    types: {
      buy: "Kauf",
      sell: "Verkauf",
      transfer_in: "Transfer (Eingang)",
      transfer_out: "Transfer (Ausgang)",
      transfer: "Transfer",
      spend: "Ausgabe",
    },
    wallet: "Wallet",
    account: "Konto",
    fromAccount: "Von Konto",
    toAccount: "Nach Konto",
    externalTransfer: "Externes Wallet (nicht im Portfolio)",
    counterpartyLinked:
      "Durch die verknüpfte Gegenbuchung bestimmt. Zum Ändern die Verknüpfung auf der Eingangstransaktion lösen.",
    amountBtc: "Menge (BTC)",
    priceEur: "Kurs (EUR/BTC)",
    totalEur: "Betrag (EUR)",
    feeBtc: "Gebühr (BTC)",
    feeEur: "Gebühr (EUR)",
    valueEur: "Wert (EUR)",
    valueFromOrigin:
      "Summe der Beträge (EUR) der zugrundeliegenden Käufe, anteilig auf diese Transaktion. Ein Transfer hat keinen eigenen Kurs; der Kurs ergibt sich aus Wert geteilt durch Menge.",
    valueFromOriginPartial:
      "Summe der Beträge (EUR) der zugrundeliegenden Käufe, aber nur für den Teil der Menge, für den ein EUR-Betrag hinterlegt ist. Der tatsächliche Wert liegt darüber.",
    valueFromTransfer:
      "Beim Anlegen des Transfers festgehalten: Summe der Beträge (EUR) der bewegten Käufe.",
    originalSection: "In anderer Währung abgewickelt",
    originalHint:
      "Nur zur Dokumentation, z. B. ein BTC-Kauf gegen USDT. Für Berechnungen und für steuerliche Zwecke ist ausschließlich der EUR-Gegenwert zum Transaktionszeitpunkt maßgeblich.",
    originalCurrency: "Originalwährung",
    originalCurrencyPlaceholder: "z. B. USDT",
    originalAmount: "Betrag (Originalwährung)",
    originalPrice: "Kurs pro BTC (Originalwährung)",
    eurValuationRun: "EUR-Wert aus historischem Kurs ermitteln",
    eurValuationDerived:
      "EUR-Wert automatisch aus dem historischen Binance-Kurs ermittelt",
    eurValuationNeedsAmount: "Dafür werden Datum und Menge benötigt.",
    eurValuationUnavailable: "Für diesen Zeitpunkt ist kein Kurs verfügbar.",
    note: "Notiz",
    onChainSection: "On-Chain-Daten (optional)",
    onChainHint:
      "Dient zum Abgleich von Transfer-Ausgang und -Eingang zwischen deinen Wallets. Rein informativ: die Sicherheits- und Privacy-Prüfungen arbeiten weiterhin ausschließlich mit der Adress-Watchlist.",
    txid: "Transaktions-ID (txid)",
    txidPlaceholder: "64 Hex-Zeichen, z. B. 4a5e1e4b…deda33b",
    txidInvalid: "Ungültige Transaktions-ID: erwartet werden genau 64 Hex-Zeichen (0-9, a-f).",
    address: "Bitcoin-Adresse",
    addressPlaceholder: "bc1… / 1… / 3…",
    addressHint:
      "Zieladresse beim Ausgang, Empfangsadresse beim Eingang. Das grenzt ein, welcher Output der Transaktion gemeint ist.",
    addressInvalid:
      "Ungültige Bitcoin-Adresse (erlaubt: Legacy 1…/3…, Bech32 bc1q…, Bech32m bc1p…).",
    onChainInherited: "Aus der verknüpften Gegenbuchung übernommen",
    onChainAdopt: "Übernehmen",
    copyValue: "In die Zwischenablage kopieren",
    copied: "Kopiert",
    openInExplorer: "Im Block-Explorer öffnen",
    deleteTitle: "Transaktion löschen",
    deleteConfirm: "Transaktion wirklich löschen?",
    bulkDeleteConfirm: "{count} ausgewählte Transaktionen wirklich löschen?",
    deleteReleasesLegs:
      "{count} verknüpfte Transfer-Buchung(en) verlieren dadurch ihre Gegenseite und werden zu externen Transfers.",
    deleteClearsAllocations:
      "Bei {count} Transaktion(en) wird die Lot-Zuordnung gelöst; sie greifen künftig automatisch auf die ältesten verfügbaren Lots zu (FIFO).",
    filterAll: "Alle",
    filterIssue: "Datenqualität",
    filterFrom: "Von",
    filterTo: "Bis",
    onlyTaxFree: "Nur steuerfreie Positionen anzeigen",
    sellLotAction: "Verkaufen",
    sellLotTitle: "Lot verkaufen",
    lotMax: "Restbestand dieses Lots: {max} BTC",
    lotExceeds: "Menge übersteigt den Restbestand des Lots ({max} BTC).",
    rowsPerPage: "Zeilen pro Seite",
    allRows: "Alle",
    taxStatus: "Steuerstatus",
    columns: "Spalten",
    timeAt: "{time} Uhr",
    selectAll: "Alle auswählen",
    selectRow: "Zeile auswählen",
    selectedCount: "{count} ausgewählt",
    clearSelection: "Auswahl aufheben",
    changeWalletAccount: "Wallet/Konto ändern",
    moveConfirm:
      "{count} Transaktion(en) werden nach „{target}“ verschoben.",
    moveTransferNote:
      "Die Auswahl enthält interne Transfers: Die jeweilige Gegenseite bleibt in ihrem Konto und wird automatisch auf das neue Konto verknüpft.",
    moveTransferConflict:
      "Nicht möglich: Bei {count} Transfer(s) lägen danach Ausgangs- und Eingangsseite im selben Konto. Bitte Ziel-Konto oder Auswahl anpassen.",
    moveLegacyTransferWarning:
      "{count} ältere Transfer-Transaktion(en) ohne Gruppen-Verknüpfung: Die Gegenseite kann nicht automatisch aktualisiert werden. Bitte anschließend manuell prüfen.",
    moveAction: "Verschieben",
    transferAction: "Übertragen zu …",
    transferSubmit: "Übertragen",
    transferIntro:
      "Bündelt die ausgewählten offenen Kauf-/Transfer-Eingang-Lots zu einem echten Transfer an ein anderes Wallet/Konto. Anders als „Wallet/Konto ändern“ entsteht dabei ein transfer_out mit Lot-Zuordnung sowie ein verknüpfter transfer_in. Die ursprünglichen Einstandsdaten und Kaufkurse der Lots bleiben für die Haltefrist-/FIFO-Berechnung erhalten.",
    transferAssignIntro:
      "Ordne diesem Eingang die Käufe zu, aus denen er stammt. Aus Quell-Konto und ausgewählten Lots entsteht ein verknüpfter Ausgang, und die Haltefrist rechnet danach ab dem ursprünglichen Kaufdatum.",
    transferAssignSource: "Quell-Konto",
    transferAssignSourcePick: "Konto wählen …",
    transferAssignPickLot: "Lot vom {date} auswählen",
    transferAssignNoLots: "In diesem Konto gibt es keine offenen Lots.",
    transferIneligible:
      "{count} ausgewählte Transaktion(en) sind kein Kauf/Transfer-Eingang mit Restbestand und werden ignoriert.",
    transferMultiSource:
      "Die ausgewählten Lots liegen in mehreren unterschiedlichen Konten. Bitte nur Lots aus einem einzigen Quell-Konto auswählen.",
    transferRemaining: "Restbestand",
    transferAmount: "Zu übertragen",
    transferFeeBtc: "Netzwerkgebühr (optional)",
    transferFeeOnTopHint:
      "Die Gebühr kommt zur Menge hinzu: Vom Quellkonto gehen Menge + Gebühr ab, beim Ziel kommt die Menge an.",
    transferSameAccount: "Ziel-Konto muss sich vom Quell-Konto unterscheiden.",
    transferSummaryLots: "Anzahl Lots",
    transferSummarySource: "Quelle",
    transferSummaryTarget: "Ziel",
    transferSummaryTotal: "Summe der Lots (BTC, verlässt das Konto)",
    transferSummaryNet: "Betrag der Transferbuchung (BTC, ohne Gebühr)",
    transferSummaryAvgCost: "Ø Einstandskurs (mengengewichtet)",
    transferSummaryCostBasis: "Einstandswert gesamt",
    transferSummaryUnknownBasisNote:
      "Für einen Teil der Menge ist kein Einstandskurs bekannt (z. B. extern empfangene Lots). Dieser Anteil ist in den Werten oben nicht enthalten.",
    transferDate: "Transfer-Datum",
    transferOutSectionTitle: "Ausgangstransaktion (Quelle: {source})",
    transferOutModeNew: "Neue Ausgangstransaktion anlegen",
    transferOutModeExisting: "Bestehende Transaktion zuordnen",
    transferInSectionTitle: "Zieltransaktion (Ziel: {target})",
    transferInModeNew: "Neue Zieltransaktion anlegen",
    transferInModeExisting: "Bestehende Transaktion zuordnen",
    transferCandidateNone: "Keine passenden Kandidaten in diesem Konto gefunden.",
    transferBestMatch: "wahrscheinlichste Übereinstimmung",
    transferMismatchOut:
      "Die gewählte Ausgangstransaktion hat {actual} BTC, erwartet werden {expected} BTC. Die zugeordneten Lots ergeben {lots} BTC abzüglich {fee} BTC Netzwerkgebühr.",
    transferMismatchIn:
      "Die gewählte Zieltransaktion hat {actual} BTC, erwartet werden aber {expected} BTC (Gesamtmenge abzüglich Gebühr).",
    transferMismatchConfirm: "Ich bestätige die Verknüpfung trotz abweichender Menge.",
    pageOf: "Seite {current} von {total}",
    prevPage: "Vorherige Seite",
    nextPage: "Nächste Seite",
    empty: "Keine Transaktionen gefunden.",
    emptyLedger: "Noch keine Transaktionen erfasst.",
    emptyLedgerEgg: "Noch nichts hier. Jeder Stack fängt bei null Sats an.",
    amountColumn: "Menge ({unit})",
    feeColumn: "Gebühr ({unit})",
    resetFilters: "Filter zurücksetzen",
    amountRequired: "Menge muss größer als 0 sein.",
    priceRequired:
      "Kurs oder Betrag (EUR) wird für Kauf/Verkauf/Ausgabe benötigt.",
    accountRequired: "Bitte zuerst ein Wallet mit Konto anlegen.",
    sameAccount: "Quell- und Zielkonto müssen verschieden sein.",
    transferredAway: "übertragen",
    transferredTarget: "Ziel",
    transferredDate: "Datum",
    transferredAmount: "Menge",
    transferredJump: "Zur Transaktion",
    section: {
      fees: "Gebühren",
      origin: "Herkunft & Zuordnung",
    },
    lotPicker: {
      search: "Suche",
      searchPlaceholder: "Datum, Notiz, Betrag …",
      planned: "Wird zugeordnet",
      noMatch: "Kein Lot passt zu diesen Filtern.",
      needOnly: "Nur den Restbedarf von {amount} BTC verteilen",
      needOnlyHint:
        "Die Auswahl wird in der Reihenfolge der Tabelle aufgefüllt; ohne Haken wird jedes Lot vollständig zugeordnet.",
      selectedSummary: "{count} ausgewählt · {amount} BTC",
      confirm: "Zuordnen",
    },
    allocations: {
      section: "Zugeordnete Käufe",
      intro:
        "Diese Käufe schließt der Transfer. Die Summe muss der Menge plus Netzwerkgebühr entsprechen, denn genau so viel hat das Konto verlassen.",
      acquired: "Kaufdatum",
      source: "Herkunfts-Konto",
      amount: "Zugeordnet",
      price: "Einstand / BTC",
      available: "Verfügbar",
      remove: "Zuordnung entfernen",
      add: "Käufe hinzufügen",
      pickTitle: "Käufe zuordnen",
      pickIntro:
        "Offene Lots im Quell-Konto, neueste zuerst. Mehrfachauswahl möglich; die zugeordneten Mengen lassen sich danach noch anpassen.",
      pickEmpty: "Im Quell-Konto gibt es keine offenen Lots mehr.",
      pickAria: "Lot vom {date} zuordnen",
      target: "Soll (Menge + Gebühr)",
      assigned: "Zugeordnet",
      unassigned: "{amount} BTC nicht zugeordnet",
      over: "{amount} BTC zu viel zugeordnet",
      exceedsLot: "Mehr als im Lot verfügbar ({available} BTC).",
      complete: "Vollständig zugeordnet.",
      preview: "Ergebnis: Herkunft",
      empty: "Diesem Transfer ist noch kein Kauf zugeordnet.",
      hint: "Ohne vollständige Zuordnung ist unbestimmt, welche Käufe dieser Transfer bewegt.",
    },
    outLeg: {
      section: "Zugeordnete Ausgangstransaktion",
      linked: "Verknüpft mit:",
      unlink: "Zuordnung lösen",
      assign: "Ausgangstransaktion zuordnen",
      none: "Diesem Eingang ist keine Ausgangstransaktion zugeordnet.",
      pickTitle: "Ausgangstransaktion zuordnen",
      pickIntro:
        "Nicht zugeordnete Ausgänge aus anderen Wallets und Konten. Oben stehen die wahrscheinlichsten Treffer.",
      pickEmpty: "Es gibt keine passende, noch freie Ausgangstransaktion.",
      pickEmptyCreate: "Stattdessen aus Lots des Quell-Kontos einen Ausgang anlegen",
      filterPeriod: "Zeitraum",
      txidMatch: "Txid identisch",
      alreadyPaired: "bereits zugeordnet",
      includePaired: "Auch Ausgangstransaktionen anzeigen, die schon eine Eingangstransaktion haben",
      joinsGroup:
        "Diese Ausgangstransaktion ist bereits zugeordnet ({legs}). Die Eingangstransaktion wird demselben Transfer hinzugefügt. Das ist richtig, wenn ein Versand in mehreren Teilen angekommen ist; andernfalls prüfe, ob die vorhandene Zuordnung falsch ist (dort „Zuordnung lösen“).",
      inLegSection: "Zugeordnete Eingangstransaktion",
      inLegNone: "Keine Eingangstransaktion zugeordnet",
      inLegHowTo:
        "Die Verknüpfung wird auf der Eingangstransaktion gesetzt: Öffne sie im Ziel-Wallet und wähle dort unter „Herkunft & Zuordnung“ diese Ausgangstransaktion aus.",
      colMatch: "Übereinstimmung",
      searchPlaceholder: "Wallet, txid, Notiz …",
      pickAria: "Ausgangstransaktion vom {date} auswählen",
      bestMatch: "Wahrscheinlichster Treffer",
      dayDiff: "{days} Tage Abstand",
      diffTitle: "Mengendifferenz",
      diffNone: "Beide Mengen sind identisch.",
      diffFee:
        "{amount} BTC Differenz, plausibel als Netzwerkgebühr ({percent} der Menge).",
      diffAdopt:
        "Differenz als Netzwerkgebühr übernehmen (die Ausgangsmenge wird dabei auf die Eingangsmenge gesetzt, die Gebühr steht daneben)",
      diffTooLarge:
        "{amount} BTC Differenz ({percent} der Menge). Das ist zu viel für eine Netzwerkgebühr, vermutlich passen die beiden Transaktionen nicht zusammen.",
      diffNegative:
        "Es sind {amount} BTC mehr angekommen als abgegangen. Das kann keine Netzwerkgebühr sein.",
      confirm: "Zuordnen",
      previewTitle: "Ergebnis: Herkunft dieses Eingangs",
    },
    origin: {
      section: "Herkunft",
      intro:
        "Aus diesen ursprünglichen Käufen besteht dieser Eingang. Haltefrist und Einstand richten sich nach dem Original-Kaufdatum, nicht nach dem Transferdatum.",
      show: "Herkunft anzeigen",
      hide: "Herkunft ausblenden",
      acquired: "Kaufdatum",
      amount: "Anteil",
      price: "Einstand / BTC",
      source: "Herkunft",
      status: "Haltefrist",
      total: "Summe",
      totalValue: "Wert {value} EUR",
      ofAmount: "von {amount} dieser Transaktion",
      jump: "Zur Kauftransaktion",
      unknownPrice: "Einstand unbekannt",
      mismatch:
        "Die Summe der Anteile weicht um {amount} BTC von der Menge dieser Transaktion ab.",
      unresolvedAmount: "{amount} BTC ohne auflösbare Herkunft",
      unlinked: "Herkunft nicht zugeordnet",
      unlinkedHint:
        "Dieser Eingang ist mit keinem Ausgang verknüpft. Ohne Verknüpfung lässt sich die Haltefrist nicht bestimmen.",
      unresolvable:
        "Dieser Eingang ist verknüpft, aber die Kette dahinter führt zu keinem Kauf.",
      truncated:
        "Die Verknüpfungskette ist fehlerhaft (Kreis oder zu tief) und wurde abgebrochen.",
      assign: "Herkunft zuordnen",
      badge: "Herkunft ungeklärt",
      none: "Für diese Transaktion gibt es keine Herkunftsauflösung.",
    },
  },
  csvImport: {
    button: "Import",
    title: "Transaktionen aus CSV importieren",
    steps: {
      file: "Datei",
      filter: "Filter",
      mapping: "Spalten",
      typeValues: "Typ-Werte",
      preview: "Vorschau",
      import: "Import",
    },
    filterIntro:
      "Optional: Beschränke den Import auf bestimmte Zeilen. Jede Bedingung prüft eine CSV-Spalte gegen die dort tatsächlich vorkommenden Werte (z. B. nur transaction_type = trade). Mehrere Bedingungen lassen sich mit UND bzw. ODER verknüpfen.",
    filterAddRule: "Bedingung hinzufügen",
    filterRemoveRule: "Bedingung entfernen",
    filterColumn: "Spalte",
    filterColumnChoose: "Spalte wählen",
    filterMatch: "Vergleich",
    filterMatchAnyOf: "ist einer von",
    filterMatchNoneOf: "ist keiner von",
    filterValues: "Werte",
    filterSelectAll: "alle",
    filterSelectNone: "keine",
    filterSearch: "Werte durchsuchen …",
    filterNoValues: "Keine Werte gefunden.",
    filterRuleInactive: "Kein Wert gewählt. Diese Bedingung wird ignoriert.",
    filterCombinator: {
      and: "UND",
      or: "ODER",
    },
    filterMatchCount: "{matched} von {total} Zeilen",
    filterNoRules: "Kein Filter aktiv. Alle {count} Zeilen werden übernommen.",
    filterEmptyResult: "Keine Zeile erfüllt den Filter.",
    filterUnknownColumn:
      "Diese Datei hat keine Spalte „{column}“. Die Bedingung wird ignoriert.",
    filterUnknownColumns:
      "Spalten aus dem Preset fehlen in dieser Datei: {columns}. Die betroffenen Bedingungen werden ignoriert.",
    summaryFilter: "Filter",
    fileIntro:
      "Wähle eine CSV-Datei (z. B. den Export deiner Börse). Die Datei wird ausschließlich lokal in deinem Browser verarbeitet und niemals hochgeladen.",
    chooseFile: "CSV-Datei wählen …",
    fileChosen: "{name} ({rows} Datenzeilen)",
    readError: "Datei konnte nicht gelesen werden.",
    duplicateFile:
      "Diese Datei wurde am {date} bereits importiert ({count} Transaktionen).",
    duplicateFileHint:
      "Erneut importieren verdoppelt die enthaltenen Buchungen und verfälscht damit auch die Steuerhistorie. Falls der Export inzwischen ergänzt wurde, prüfe die Vorschau: bereits vorhandene Zeilen werden dort als Dublette markiert.",
    duplicateFileAck: "Datei trotzdem erneut einlesen",
    duplicateRows: "{certain} Dubletten, {probable} mögliche",
    duplicateIntro:
      "Dubletten sind vom Import ausgenommen. Identische Buchungen können echt sein, etwa geteilte Orders, deshalb wird nichts automatisch verworfen.",
    duplicateBadge: "Dublette",
    duplicateBadgeMaybe: "mögliche Dublette",
    duplicateReason: {
      txid: "Gleiche Txid im selben Konto",
      exact: "Konto, Typ, Zeitpunkt, Menge und Betrag identisch",
      nearby: "Gleiche Werte, Zeitpunkt {minutes} Min. entfernt",
    },
    duplicateOfRow: "Dublette von Zeile {line} derselben Datei",
    duplicateShowExisting: "Vorhandene Transaktion anzeigen",
    duplicateFilter: {
      all: "Alle",
      new: "Nur neue",
      duplicates: "Nur Dubletten",
    },
    duplicateSkipAll: "Alle Dubletten überspringen",
    duplicateImportAll: "Alle Dubletten trotzdem importieren",
    summaryDuplicates: "Übersprungene Dubletten",
    summaryDuplicatesKept: "({count} bewusst übernommen)",
    doneBatchId: "Import-ID",
    doneUndoHint:
      "Dieser Import lässt sich in den Einstellungen als Ganzes rückgängig machen.",
    emptyFile: "Die Datei enthält keine Datenzeilen.",
    hasHeader: "Erste Zeile enthält Spaltenüberschriften",
    delimiter: "Trennzeichen",
    delimiterComma: "Komma (,)",
    delimiterSemicolon: "Semikolon (;)",
    decimalSeparator: "Dezimaltrennzeichen",
    decimalDot: "Punkt (1234.56)",
    decimalComma: "Komma (1.234,56)",
    encoding: "Zeichensatz",
    autoDetected: "automatisch erkannt",
    parsing: "Datei wird eingelesen …",
    target: "Ziel für die importierten Transaktionen",
    targetWallet: "Ziel-Wallet",
    targetAccount: "Ziel-Konto",
    newWalletOption: "+ Neues Wallet anlegen …",
    newAccountOption: "+ Neues Konto anlegen …",
    newWalletName: "Name des neuen Wallets",
    newWalletNamePlaceholder: "Börse",
    newAccountName: "Name des neuen Kontos",
    preset: "Import-Preset",
    presetManual: "Manuell / ohne Vorlage",
    presetSystemGroup: "Vordefiniert",
    presetUserGroup: "Eigene Presets",
    presetPredefined: "Dieses Preset ist vordefiniert und kann nicht bearbeitet oder gelöscht werden.",
    presetDelete: "Preset löschen",
    presetApplied: "Preset „{name}“ automatisch angewendet.",
    presetSaveAsName: "Name für neues Preset (z. B. Börsen-Export)",
    presetSaveAs: "Als neues Preset speichern",
    presetSaved: "Preset „{name}“ gespeichert.",
    presetCandidates:
      "{count} Presets passen zu diesen Spalten. Das neueste ist ausgewählt; hier wechseln:",
    presetExportHint:
      "Enthält nur die Konfiguration, keine Beträge, Adressen oder Dateinamen.",
    column: "Spalte",
    mappingIntro:
      "Ordne die CSV-Spalten den Transaktionsfeldern zu. Felder ohne Zuordnung werden leer übernommen.",
    noMapping: "keine Zuordnung",
    required: "Pflichtfeld",
    typeFromColumn: "Aus Spalte",
    typeFixed: "Fester Wert",
    typeFixedHint:
      "Der gewählte Typ wird für alle importierten Zeilen übernommen (z. B. für reine Kauf-Exports ohne Typ-Spalte).",
    sample: "Beispiel: {value}",
    unit: "Einheit",
    unitBtc: "BTC",
    unitSats: "Sats",
    fields: {
      type: "Typ",
      date: "Datum",
      time: "Uhrzeit",
      amountBtc: "Menge (BTC)",
      pricePerBtcEur: "Kurs (EUR/BTC)",
      totalFiatEur: "Betrag (EUR)",
      feeBtc: "Gebühr (BTC)",
      feeFiatEur: "Gebühr (EUR)",
      originalCurrency: "Originalwährung",
      originalAmount: "Betrag (Originalwährung)",
      originalPricePerBtc: "Kurs pro BTC (Originalwährung)",
      txid: "Transaktions-ID (txid)",
      address: "Bitcoin-Adresse",
      note: "Notiz",
    },
    dateFormat: "Datumsformat",
    dateFormatChoose: "Datumsformat wählen",
    dateFormats: {
      iso: "ISO 8601 (2026-07-24)",
      de: "TT.MM.JJJJ (24.07.2026)",
      mdy: "MM/DD/YYYY (07/24/2026)",
      dmy: "DD/MM/YYYY (24/07/2026)",
      ymd: "JJJJ/MM/TT (2026/07/24)",
      "unix-s": "Unix-Timestamp (Sekunden)",
      "unix-ms": "Unix-Timestamp (Millisekunden)",
    },
    btcFeeModeQuestion: {
      in: "Käufe: ist die Gebühr von der BTC-Menge bereits abgezogen?",
      out: "Verkäufe/Ausgänge: ist die Gebühr von der BTC-Menge bereits abgezogen?",
    },
    btcFeeModes: {
      deducted: "Ja, bereits abgezogen",
      notDeducted: "Nein, noch nicht abgezogen",
    },
    fiatFeeModeQuestion: "Ist diese Gebühr im EUR-Betrag bereits enthalten?",
    fiatFeeModes: {
      gross: "Ja, im Betrag enthalten (Bruttobetrag)",
      net: "Nein, kommt zusätzlich hinzu (Nettobetrag)",
    },
    amountFeeAdded: "Menge laut Datei {file} plus Gebühr {fee} (siehe Gebühren-Einstellung)",
    amountFeeRemoved:
      "Menge laut Datei {file} abzüglich Gebühr {fee} (siehe Gebühren-Einstellung)",
    effectiveEur: "Anschaffung / Erlös (EUR)",
    effectiveEurCostHint:
      "EUR-Gesamtbetrag, der als Anschaffungskosten angesetzt wird (Betrag plus EUR-Gebühr).",
    effectiveEurProceedsHint:
      "EUR-Erlös, der angesetzt wird (Betrag abzüglich EUR-Gebühr).",
    effectiveEurRate: "Kurs {rate} EUR/BTC",
    eurValuationIntro:
      "{count} Zeile(n) haben keinen EUR-Wert, etwa weil in einer anderen Währung abgerechnet wurde. Der EUR-Gegenwert kann aus dem historischen Binance-Kurs des Transaktionstags ermittelt werden und bleibt danach überschreibbar.",
    eurValuationRun: "Fehlende EUR-Werte ermitteln",
    eurValuationProgress: "{done} von {total} …",
    eurValuationDone: "{count} Zeile(n) bewertet",
    eurValuationFailed: "({count} ohne Kurs)",
    eurMissingHint: "EUR-Wert fehlt, kann aus dem historischen Kurs ermittelt werden",
    eurDerivedHint: "EUR-Wert aus dem historischen Binance-Kurs ermittelt",
    timeFormat: "Zeitformat",
    timeFormatChoose: "Zeitformat wählen",
    timeFormats: {
      hms: "HH:MM(:SS) (14:30:00)",
      h12: "12-Stunden (02:30 PM)",
      datetime: "aus Datum und Uhrzeit in einer Spalte",
    },
    typeValuesIntro:
      "Ordne jedem in der Spalte „{column}“ vorkommenden Wert einen internen Transaktionstyp zu. Bereits bekannte Werte (z. B. „Kauf“) sind vorausgefüllt.",
    typeValuesUnmapped:
      "{count} Wert(e) benötigen noch eine Zuordnung, bevor du fortfahren kannst.",
    typeValuesChoose: "Typ wählen",
    previewIntro:
      "Prüfe die Zeilen vor dem Import. Fehlerhafte Zeilen sind markiert und können direkt korrigiert oder über den Schalter ausgeschlossen werden.",
    validRows: "{count} gültig",
    errorRows: "{count} fehlerhaft",
    excludedRows: "{count} ausgeschlossen",
    sumBtc: "Summe (gültige Zeilen): {amount} BTC",
    line: "Zeile",
    includeColumn: "Import",
    dateReadAs: "Wird gelesen als: {date}",
    includeRow: "Zeile {line} importieren",
    showAllColumns: "Alle Spalten anzeigen",
    showAllColumnsHint: "Alle Spalten anzeigen ({count} nicht gemappte ausgeblendet)",
    errors: {
      invalidType: "Ungültiger oder fehlender Typ",
      invalidDate: "Ungültiges Datum",
      invalidTime: "Ungültige Uhrzeit",
      invalidOriginal: "Betrag oder Kurs in der Originalwährung ist keine Zahl",
      invalidAmount: "Menge fehlt oder ist nicht größer als 0",
      missingPrice: "Kurs oder Betrag (EUR) wird für Kauf/Verkauf/Ausgabe benötigt",
      invalidPrice: "Ungültiger Kurs",
      invalidTotal: "Ungültiger Betrag (EUR)",
      invalidFee: "Ungültige Gebühr (muss ≥ 0 sein)",
      invalidTxid: "Ungültige Transaktions-ID (genau 64 Hex-Zeichen)",
      invalidAddress: "Ungültige Bitcoin-Adresse",
    },
    confirmIntro:
      "Bereit zum Import. Es werden nur gültige, nicht ausgeschlossene Zeilen übernommen. Fehlerhafte Zeilen werden übersprungen.",
    summaryFile: "Datei",
    summaryTarget: "Ziel",
    summaryImport: "Wird importiert",
    summarySkipped: "Übersprungen (fehlerhaft)",
    summaryExcluded: "Ausgeschlossen",
    summarySum: "Summe (BTC)",
    importNow: "{count} Transaktionen importieren",
    rowCount: "{count} Zeilen",
    doneTitle: "Import abgeschlossen",
    doneMessage: "{count} Transaktionen wurden importiert und gespeichert.",
    goToTable: "Zur Transaktionstabelle",
  },
  tax: {
    title: "Steuer (Deutschland, FIFO)",
    disclaimer:
      "Keine Steuerberatung. FIFO-Zuordnung nach §23 EStG mit {days} Tagen Haltefrist.",
    export: "Export (CSV)",
    exportHint: "Veräußerungen des gewählten Jahres als CSV-Datei, lokal erzeugt.",
    exportFileName: "steuer",
    openLots: "Offene Lots",
    acquired: "Erworben",
    amount: "Menge",
    remaining: "Restmenge",
    costPerBtc: "Einstand / BTC",
    taxFreeFrom: "Steuerfrei ab",
    daysLeft: "Noch {days} Tage",
    taxFreeNow: "Steuerfrei",
    taxable: "Steuerpflichtig",
    taxableDaysLeft: "Steuerpflichtig, noch {days} Tage",
    disposals: "Veräußerungen (realisiert)",
    proceeds: "Erlös",
    cost: "Einstand",
    gain: "Gewinn/Verlust",
    taxableGain: "Steuerpflichtig",
    taxFreeGain: "Steuerfrei",
    uncoveredWarning:
      "{amount} BTC ohne zugeordnetes Lot veräußert. Prüfe fehlende Käufe/Transfers.",
    unknownBasis: "Einstand unbekannt (externer Transfer)",
    unresolvedOriginHint:
      "{amount} BTC dieser Veräußerung stammen aus Lots ohne auflösbare Herkunft. Die Haltefrist stützt sich hier auf ein Eingangsdatum, nicht auf ein Kaufdatum.",
    emptyLots: "Keine offenen Lots.",
    emptyDisposals: "Noch keine Verkäufe oder Ausgaben.",
    year: "Jahr",
    totalRealized: "Realisiert gesamt",
  },
  presets: {
    title: "Import-Presets",
    intro:
      "Ein Preset hält fest, wie ein bestimmter Export gelesen wird: Trennzeichen, Formate, Spaltenzuordnung, Gebühren-Konventionen. Vordefinierte Presets kommen mit der App und sind schreibgeschützt; eigene liegen in deiner Portfolio-Datei und wandern mit ihr.",
    systemTitle: "Vordefiniert",
    systemEmpty:
      "Zurzeit liefert die App keine vordefinierten Presets aus. Ein funktionierender Import lässt sich am Ende des Assistenten als JSON exportieren und beitragen; siehe config/import-presets/README.md.",
    userTitle: "Eigene Presets",
    userEmpty:
      "Noch keine eigenen Presets. Am Ende eines Imports kannst du die Einstellungen als Preset speichern.",
    readOnly: "Schreibgeschützt: Nur ein App-Update ändert dieses Preset.",
    noProvider: "Ohne Anbieter",
    noSignature: "keine Spaltensignatur",
    signatureColumns: "{count} Spalten in der Signatur",
    formatVersionShort: "Format v{version}",
    rename: "Umbenennen",
    duplicate: "Als eigenes Preset duplizieren",
    copySuffix: "(Kopie)",
    duplicated: "„{name}“ angelegt.",
    delete: "Löschen",
    deleteConfirm: "Preset „{name}“ löschen?",
    importTitle: "Preset aus JSON übernehmen",
    importIntro:
      "Eine geteilte Preset-Datei wird geprüft und als eigenes Preset übernommen. Passt sie nicht zum Schema, wird sie mit Begründung abgelehnt statt halb übernommen.",
    importAction: "JSON-Datei wählen",
    importFailed: "Diese Datei ist kein gültiges Preset:",
    imported: "Preset „{name}“ übernommen.",
    field: {
      name: "Name",
      provider: "Anbieter",
      formatVersion: "Formatversion",
      id: "ID",
      description: "Beschreibung",
      headerSignature: "Spaltensignatur",
    },
    export: {
      action: "Preset als JSON exportieren",
      title: "Preset exportieren",
      intro:
        "Die Datei enthält ausschließlich die Konfiguration, also keine Transaktionen, Beträge, Adressen oder Dateinamen. Anbieter und Formatversion sorgen dafür, dass mehrere Exportformate desselben Anbieters nebeneinander bestehen können.",
      headerHint:
        "Die Spaltensignatur ist die Kopfzeile der eingelesenen Datei. Daran erkennt der Assistent denselben Export beim nächsten Mal wieder; sie darf angepasst werden.",
      removedTitle: "Aus dem Export entfernt",
      removedHint:
        "Diese Werte sehen nach Daten statt nach Konfiguration aus und gehören nicht in ein geteiltes Preset.",
      reason: {
        address: "Bitcoin-Adresse",
        txid: "Transaktions-ID",
        amount: "Betrag",
        email: "E-Mail-Adresse",
        iban: "IBAN",
      },
      invalid: "So kann das Preset noch nicht exportiert werden:",
      preview: "JSON ansehen",
      copy: "In die Zwischenablage",
      copied: "Kopiert.",
      download: "Als Datei speichern",
    },
    issue: {
      notJson: "Die Datei ist kein lesbares JSON.",
      notObject: "Die Datei enthält kein Preset-Objekt.",
      missing: "Pflichtfeld fehlt.",
      invalidValue: "Unzulässiger Wert (erlaubt: {detail}).",
      unsupportedSchemaVersion:
        "Schema-Version {detail} ist dieser App-Version unbekannt.",
      emptyMapping: "Keine einzige Spalte zugeordnet.",
      emptyHeaderSignature:
        "Ohne Spaltensignatur kann keine Datei erkannt werden.",
      typeConflict:
        "Fester Typ und zugeordnete Typ-Spalte schließen sich gegenseitig aus.",
      personalData:
        "Sieht nach persönlichen Daten aus: {detail}. Presets enthalten ausschließlich Konfiguration.",
    },
  },
  imports: {
    title: "Importe",
    intro:
      "Jeder CSV-Import wird mit Datei, Preset und Anzahl festgehalten. Damit erkennt der Assistent dieselbe Datei beim nächsten Mal wieder, und ein Import lässt sich als Ganzes zurücknehmen.",
    date: "Zeitpunkt",
    file: "Datei",
    preset: "Preset",
    count: "Transaktionen",
    manualPreset: "manuell zugeordnet",
    undo: "Rückgängig",
    undoTitle: "Import rückgängig machen",
    undoIntro:
      "Aus „{file}“ stammen {count} Transaktionen. Sie werden aus der Datei entfernt.",
    undoConfirm: "{count} Transaktionen entfernen",
    blockedIntro:
      "{count} davon hängen inzwischen an anderen Transaktionen und bleiben deshalb erhalten:",
    blocked: {
      allocatedByOther: "wird von einer späteren Veräußerung als Lot genutzt",
      linkedTransfer: "ist mit einem Transfer verknüpft, dessen Gegenstück bleibt",
      allocatesOther: "schließt Lots, die nicht aus diesem Import stammen",
    },
    blockedHint:
      "Es werden nur die {count} unverknüpften Transaktionen entfernt. Die übrigen zuerst manuell lösen (Zuordnung oder Transfer-Verknüpfung), damit keine Verweise ins Leere zeigen.",
  },
  watchlist: {
    title: "Adress-Watchlist",
    subtitle:
      "Watch-only: Adressen oder xpubs beobachten. Live-Daten kommen von der konfigurierten Explorer-Quelle und werden nicht gespeichert.",
    add: "Adresse hinzufügen",
    addressOrXpub: "Adresse oder xpub",
    label: "Bezeichnung",
    labelPlaceholder: "Hardware-Wallet, Konto 1",
    tags: "Tags (kommagetrennt)",
    type: "Typ",
    invalidValue: "Bitte eine gültige Bitcoin-Adresse oder einen xpub eingeben.",
    xpubWarning:
      "Achtung: Wer diesen xpub kennt, sieht die gesamte Transaktionshistorie und alle zukünftigen Adressen dieses Wallets. Nur watch-only verwenden und niemals weitergeben.",
    xpubNotScanned:
      "xpub-Scan (automatische Ableitung aller Adressen) folgt in einer späteren Version. Der Eintrag wird gespeichert, Live-Daten gibt es derzeit nur für einzelne Adressen.",
    deleteConfirm: "Eintrag „{label}“ von der Watchlist entfernen?",
    empty: "Noch keine beobachteten Adressen.",
    balance: "Saldo",
    txCount: "Transaktionen",
    utxos: "UTXOs",
    privacyScore: "Privacy Score",
    findings: {
      addressReuse:
        "Adresse wurde {count}× für Empfänge genutzt (Address Reuse). Für jede Zahlung besser eine frische Adresse verwenden.",
      pubkeyLeaked:
        "Public Key ist durch eine frühere Ausgabe on-chain sichtbar (relevant z. B. für Quantum-Risiko-Diskussionen).",
      legacyFormat:
        "Legacy-/P2SH-Adressformat: moderne Formate (Native SegWit bc1q / Taproot bc1p) bieten niedrigere Gebühren und bessere Privatsphäre.",
      possiblePoisoning:
        "Dust-Eingang erkannt, mögliches Address Poisoning. Beim Kopieren von Adressen aus der Historie besonders aufpassen, Beträge niemals „zurücksenden“.",
      dustUtxo:
        "{count} Dust-UTXO(s): Die Ausgabe würde mehr Gebühren kosten, als der UTXO wert ist.",
      roundAmounts:
        "{count} auffällig runde Empfangsbeträge. Das erleichtert die Chain-Analyse (Wechselgeld-Erkennung).",
    },
    utxoTable: {
      outpoint: "Outpoint",
      value: "Wert",
      date: "Datum",
      labelTag: "Label / Tags",
      dust: "Dust",
      editLabel: "Label bearbeiten",
    },
    consolidation:
      "{count} kleine UTXOs und aktuell niedrige Gebühren ({fee} sat/vB). Guter Zeitpunkt zum Konsolidieren.",
    feeRate: "Gebühren (Economy)",
    loadError: "Live-Daten konnten nicht geladen werden: {error}",
    noLiveData: "Keine Live-Daten für xpub-Einträge.",
  },
  lock: {
    title: "Gesperrt",
    passwordPlaceholder: "Passwort",
    unlock: "Entsperren",
    unlocking: "Wird entschlüsselt …",
    wrongPassword: "Falsches Passwort. Bitte erneut versuchen.",
    failed: "Entsperren fehlgeschlagen.",
    blocked:
      "Nach {attempts} Fehlversuchen: nächster Versuch in {seconds} Sekunden möglich.",
    hint:
      "Die Daten sind verschlüsselt und liegen nicht mehr entschlüsselt im Speicher. Ohne Passwort kommt niemand daran, auch du nicht.",
    closeFile: "Datei schließen",
    lockNow: "Jetzt sperren",
    cannotLock: "Unverschlüsselte Dateien können nicht gesperrt werden",
    warningTitle: "Gleich wird gesperrt",
    warningBody:
      "Wegen Inaktivität wird in {seconds} Sekunden gesperrt. Ungespeicherte Änderungen werden vorher gesichert.",
    warningDeferred:
      "Sperren wartet noch: ein laufender Vorgang wird erst abgeschlossen.",
    stayUnlocked: "Entsperrt bleiben",
    busyToast: "Sperren nicht möglich: Es läuft noch ein Vorgang. Nach dessen Abschluss wieder versuchen.",
  },
  backups: {
    title: "Backups",
    intro:
      "Deine Daten liegen in einer einzigen Datei. Damit ein beschädigtes oder verlorenes Exemplar nicht alles bedeutet, schreibt die App verschlüsselte Kopien in einen Ordner deiner Wahl und liest jede davon sofort wieder ein, um zu prüfen, dass sie sich auch wiederherstellen lässt.",
    unsupported:
      "Dieser Browser kann keinen Ordner öffnen (keine File System Access API). Automatische Backups sind damit nicht möglich. Du kannst jederzeit ein Backup als Download erzeugen, musst das aber selbst anstoßen.",
    noFolder:
      "Es ist noch kein Backup-Ordner ausgewählt. Ohne Ordner kann die App keine Kopien anlegen.",
    noFolderShort: "Kein Backup-Ordner ausgewählt",
    folderHint:
      "Das Handle der Portfolio-Datei erlaubt kein Schreiben von Nachbardateien. Für Backups ist deshalb einmalig ein Ordner nötig; die Auswahl wird gemerkt.",
    folder: "Ordner",
    chooseFolder: "Backup-Ordner wählen",
    changeFolder: "Anderer Ordner",
    forgetFolder: "Ordner vergessen",
    reconnect: "Zugriff erneut erlauben",
    permissionNeeded:
      "Nach einem Neustart des Browsers muss der Schreibzugriff auf den Ordner einmal bestätigt werden.",
    backupNow: "Backup jetzt erstellen",
    running: "Backup läuft …",
    download: "Backup herunterladen",
    empty: "Noch keine Backups in diesem Ordner.",
    when: "Zeitpunkt",
    size: "Größe",
    contents: "Inhalt",
    inspect: "Inhalt prüfen",
    restore: "Wiederherstellen",
    password: "Passwort der Backups",
    passwordPlaceholder: "Passwort",
    passwordHint:
      "Wird nur zum Entschlüsseln im Browser verwendet. Ältere Backups können ein früheres Passwort haben.",
    transactions: "{count} Transaktionen",
    lastTransaction: "letzte Transaktion: {date}",
    noTransactions: "keine Transaktionen",
    integrityMismatch: "Prüfsumme stimmt nicht",
    lastOk: "Backup geschrieben und verifiziert: {name} ({pruned} alte entfernt)",
    confirmTitle: "Backup wiederherstellen?",
    confirmBody:
      "Der aktuelle Stand wird durch den Stand aus dem Backup ersetzt. Prüfe beide Seiten, bevor du fortfährst.",
    currentFile: "Aktuell geöffnet",
    theBackup: "Backup",
    safetyNote:
      "Vor dem Wiederherstellen wird automatisch ein Backup des aktuellen Zustands geschrieben und verifiziert. Der Vorgang lässt sich damit wieder rückgängig machen.",
    restoreConfirm: "Ja, wiederherstellen",
    restoring: "Wird wiederhergestellt …",
    openView: "Backups öffnen",
    reminderNever:
      "Von dieser Datei existiert noch kein verifiziertes Backup.",
    reminderDays: "Das letzte verifizierte Backup ist {days} Tage her.",
    error: {
      noDirectory: "Kein Backup-Ordner ausgewählt.",
      noPortfolio: "Keine Datei geöffnet.",
      writeFailed: "Das Backup konnte nicht geschrieben werden.",
      verifyFailed:
        "Das Backup wurde geschrieben, ließ sich aber nicht wieder einlesen. Verlasse dich nicht darauf.",
      permission: "Der Zugriff auf den Backup-Ordner muss erneut erlaubt werden.",
      wrongPassword: "Falsches Passwort für dieses Backup.",
      readOnly: "Die Datei ist nur zum Ansehen geöffnet.",
    },
  },
  readOnly: {
    badge: "Nur Lesen",
    badgeTitle:
      "Diese Datei ist nur zum Ansehen geöffnet. Es wird nichts geschrieben: kein Speichern, kein Autosave, kein Backup.",
    enable: "Nur zum Ansehen",
    enableTitle: "Nur-Lesen-Modus einschalten: Die Datei wird ab sofort nicht mehr verändert.",
    disable: "Bearbeiten aktivieren",
    disableConfirm:
      "Bearbeiten aktivieren? Ab dann schreibt die App Änderungen wieder in diese Datei.",
    blocked: "Nur-Lesen-Modus: Diese Änderung wurde nicht ausgeführt.",
    disabledHint: "Im Nur-Lesen-Modus gesperrt. Oben im Kopf „Bearbeiten aktivieren“ wählen.",
    openLabel: "Nur zum Ansehen öffnen",
    openHint: "Die Datei wird beim Öffnen und danach nicht angefasst; nützlich für Dateien in einem synchronisierten Ordner.",
    rememberFile: "Diese Datei künftig nur zum Ansehen öffnen",
    settingsTitle: "Nur-Lesen-Modus",
    settingsBody:
      "Zum Ansehen geöffnet: Die Datei lässt sich lesen, auswerten und exportieren, aber nicht verändern. Es wird nichts geschrieben, auch kein Autosave. Darstellung, Layout und Spalten kannst du weiterhin umstellen; sie gelten nur für diese Sitzung.",
    settingsState: "Zustand",
    stateOn: "Nur Lesen",
    stateOff: "Bearbeiten",
    viewBackup: "Zur Ansicht öffnen",
    viewBackupHint:
      "Öffnet dieses Backup schreibgeschützt. Die aktuell geöffnete Datei bleibt unverändert.",
    viewBackupUnsaved:
      "Es gibt ungespeicherte Änderungen. Backup trotzdem zur Ansicht öffnen? Die Änderungen gehen verloren.",
  },
  settings: {
    title: "Einstellungen",
    nav: {
      general: "Allgemein",
      appearance: "Darstellung",
      security: "Sicherheit",
      backups: "Backups",
      history: "Änderungsverlauf",
      import: "Import",
      tax: "Steuer",
      explorer: "Explorer",
    },
    general: "Allgemein",
    language: "Sprache",
    currencyBtc: "BTC (Beträge in Sats)",
    laserEyes: "Laseraugen",
    laserEyesHint: "Rein kosmetisch: das Logo glüht.",
    theme: "Farbschema",
    themes: {
      ocean: "Ozean (Standard)",
      night: "Nacht",
      terminal: "Terminal",
      gold: "Gold",
      paper: "Papier",
      sunrise: "Sonnenaufgang",
      nord: "Nord",
      mono: "Monochrom",
      mempool: "Mempool",
    },
    themeMode: {
      fixed: "Festes Theme",
      system: "Systemeinstellung folgen",
    },
    themeSystemHint:
      "Wechselt automatisch, wenn dein Betriebssystem zwischen hell und dunkel umschaltet. Wähle je ein Theme für beide Fälle.",
    themeForLight: "Wenn das System hell ist",
    themeForDark: "Wenn das System dunkel ist",
    colorBlindSafe: "Farbfehlsichtigkeits-freundlich",
    colorBlindSafeHint:
      "Gewinne werden blau statt grün dargestellt, Verluste bleiben rot. Unabhängig vom gewählten Theme; Richtungspfeile zeigt die App ohnehin immer.",
    currency: "Anzeigewährung",
    security: "Sicherheit & Datei",
    changePassword: "Passwort ändern",
    newPassword: "Neues Passwort",
    encryptionOn: "Verschlüsselung aktiv (AES-256-GCM)",
    encryptionOff: "Verschlüsselung deaktiviert",
    disableEncryption: "Verschlüsselung ausschalten",
    enableEncryption: "Verschlüsselung einschalten",
    disableEncryptionConfirm:
      "Wirklich ohne Verschlüsselung speichern? Jeder mit Zugriff auf die Datei kann dann alle Daten lesen.",
    passwordChanged: "Passwort geändert. Beim nächsten Speichern wird es verwendet.",
    lock: "Sperren bei Inaktivität",
    lockAfter: "Automatisch sperren nach",
    lockMinutes: "{count} Minuten",
    lockNever: "Nie",
    lockOnHide: "Beim Tabwechsel oder Minimieren sofort sperren",
    lockOnHideHint:
      "Sperrt, sobald der Tab in den Hintergrund geht. Praktisch am geteilten Rechner, kann aber unterbrechen, wenn du oft zwischen Fenstern wechselst.",
    lockShowFileName: "Dateinamen im Sperrbildschirm zeigen",
    lockShowFileNameHint:
      "Aus lässt auch den Dateinamen weg, falls schon er zu viel verrät.",
    lockNeedsEncryption:
      "Diese Datei ist nicht verschlüsselt und kann deshalb nicht gesperrt werden: Ohne Passwort gibt es nichts, womit sich sperren ließe. Vergib oben ein Passwort, dann greift die Sperre.",
    lockHint:
      "Beim Sperren werden ungespeicherte Änderungen zuerst gesichert, danach werden die entschlüsselten Daten und das Passwort aus dem Speicher entfernt. Zum Entsperren wird das Passwort erneut gebraucht. Manuell sperren: Strg/Cmd + L.",
    appearance: "Darstellung",
    backupSchedule: "Zeitplan und Aufbewahrung",
    backups: "Backups",
    backupTriggerLabel: "Backup erstellen",
    backupKeepLatest: "Anzahl jüngster Backups behalten",
    backupReminderDays: "Erinnern nach (Tage ohne Backup)",
    backupRetentionHint:
      "Zusätzlich bleiben je ein tägliches der letzten {daily} Tage, ein wöchentliches der letzten {weekly} Wochen und ein monatliches der letzten {monthly} Monate erhalten. Gelöscht wird nur, wenn danach mindestens ein verifiziertes Backup übrig bleibt.",
    backupLastOk: "Letztes Backup verifiziert: {when}",
    backupLastUnverified:
      "Letztes Backup vom {when} konnte nicht verifiziert werden. Verlasse dich nicht darauf.",
    backupNever: "Von dieser Datei existiert noch kein verifiziertes Backup.",
    backupWithNewPassword: "Backup mit neuem Passwort erstellen",
    passwordChangedBackups:
      "Bestehende Backups bleiben mit dem alten Passwort verschlüsselt und lassen sich nur damit öffnen. Lege am besten gleich ein frisches Backup an.",
    passwordChangeBackupWarning:
      "Ein neues Passwort gilt nur für künftige Speicherungen. Alle vorhandenen Backups brauchen weiterhin das alte Passwort.",
    changeLog: "Änderungsverlauf",
    changeLogHint:
      "Die letzten Änderungen in dieser Datei, für Nachvollziehbarkeit und zum Zurücknehmen einzelner Aktionen. Das ist keine Datensicherung: dafür sind die Backups da.",
    changeLogEmpty: "Noch keine Änderungen aufgezeichnet.",
    undo: "Zurücknehmen",
    notUndoable: "zu umfangreich",
    changeKind: {
      add: "{count} Transaktion(en) erfasst",
      update: "{count} Transaktion(en) bearbeitet",
      delete: "{count} Transaktion(en) gelöscht",
      move: "{count} Transaktion(en) verschoben",
      import: "{count} Transaktion(en) importiert",
      importUndo: "Import zurückgenommen ({count})",
      restore: "Wiederherstellung ({count} betroffen)",
    },
    backupTrigger: {
      everySave: "Bei jedem Speichern",
      daily: "Einmal täglich",
      manual: "Nur manuell",
    },
    explorer: "Explorer-Quelle (On-Chain-Daten)",
    explorerPublic: "Public API",
    explorerCustom: "Eigener Server (Esplora-kompatibel)",
    explorerEndpoint: "Endpoint-URL",
    explorerPrivacyNote:
      "Hinweis: Bei Public APIs werden deine beobachteten Adressen an einen Drittanbieter übermittelt (inkl. deiner IP). Maximale Privatsphäre bietet ein eigener Node/Server.",
    importSettings: "Import",
    duplicateTolerance: "Zeittoleranz für Dubletten (Minuten)",
    duplicateToleranceHint:
      "Beim CSV-Import gelten sonst identische Buchungen innerhalb dieser Spanne als mögliche Dublette. Exporte behandeln Zeitzonen und Rundung uneinheitlich, deshalb reicht ein exakter Zeitstempel-Vergleich nicht. 0 schaltet die Toleranz ab; exakte Treffer werden weiterhin erkannt.",
    taxSettings: "Steuer",
    holdingPeriod: "Haltefrist (Tage)",
    costBasisMethod: "Zuordnungsverfahren",
    taxExemptionLimit: "Freigrenze private Veräußerungsgeschäfte (EUR)",
    taxExemptionLimitHint:
      "Freigrenze nach § 23 EStG, konfigurierbar weil der Gesetzgeber sie ändert (600 € bis 2023, seit 2024 1.000 €). Freigrenze heißt: Wird sie überschritten, ist der gesamte Gewinn steuerpflichtig, nicht nur der übersteigende Teil.",
    autosave: "Autosave",
    autosaveDebounce: "Verzögerung nach Änderung (ms)",
    autosaveNote:
      "Autosave gilt nur im Modus mit direktem Dateizugriff. Im Fallback-Modus speicherst du über den Speichern-Button.",
    fileMode: "Datei-Modus",
    fileModeFsa: "Direkter Dateizugriff (automatisches Speichern)",
    fileModeFallback: "Upload/Download (manuelles Speichern)",
  },
};

export default de;
