# DepotWatch Orange

Local-First Web-App zur Verwaltung eines Bitcoin-Portfolios mit deutscher Steuerlogik.
Next.js (App Router), Tailwind, TypeScript. Sprachen DE (Standard) und EN.

**Kernprinzip:** Keine Nutzerdaten auf dem Server. Das gesamte Portfolio liegt in einer
einzigen, passwortverschlüsselten Datei auf dem Gerät des Nutzers.

Details zu Datenmodell, Features und Entscheidungen: siehe `/docs/` (dort nachschlagen,
wenn für die Aufgabe relevant — nicht vorsorglich lesen).

---

## Invarianten

Regeln, deren Verletzung Daten stillschweigend beschädigt. Vor Änderungen an Bestands-,
Lot- oder Steuerlogik immer prüfen.

1. **Keine Nutzerdaten verlassen das Gerät.** Keine Datenbank, kein Upload, kein
   Telemetrie-Ping. Portfoliodaten gehören niemals in Service-Worker-Caches, Server-Routen
   oder Logs. Externe Abrufe (Kurse, Chain, News) nur für öffentliche Daten und nur
   ausgelöst durch Nutzeraktion oder bewusste Einstellung.

2. **EUR ist die einzige Bewertungswährung.** FIFO, Haltefristen, Gewinne und alle Summen
   rechnen in EUR. Andere Währungen sind reine Anzeige-Umrechnung oder Dokumentation
   (`original*`-Felder).

3. **Gebühren-Konvention.** `amountBtc` einer abgehenden Transaktion ist die Menge, die
   beim Empfänger **ankommt**; `feeBtc` geht **zusätzlich** ab.
   → Abgang vom Quellkonto = `amountBtc + feeBtc`
   → `lotAllocations` müssen `amountBtc + feeBtc` abdecken
   → zusammengehörige `transfer_out`/`transfer_in` tragen dieselbe `amountBtc`
   Immer über die zentrale Hilfsfunktion rechnen, nie die Addition lokal wiederholen.

4. **`transfer_in` erzeugt kein neues Lot.** Anschaffungsdatum und Einstandskurs werden zur
   Laufzeit über `transferGroupId` → `lotAllocations` bis zur ursprünglichen Buy-Transaktion
   aufgelöst, über beliebig viele Hops. Das `date` eines `transfer_in` ist reine
   Ankunftsinformation und niemals Grundlage der Haltefrist.

5. **`lotAllocations` werden beim Anlegen eingefroren.** Einmal gesetzte Zuordnungen werden
   nie rückwirkend neu berechnet, auch nicht wenn später Transaktionen hinzukommen.

6. **Change-Outputs sind keine Zugänge.** On-Chain-Wechselgeld verlässt das Wallet nicht und
   darf niemals als `transfer_in` oder Lot erfasst werden — sonst verdoppelt sich der
   Bestand und Haltefristen werden zurückgesetzt.

7. **Ledger und Adress-Watchlist sind getrennte Ebenen.** Security- und UTXO-Funktionen
   arbeiten ausschließlich auf der Watchlist. Die Felder `txid`/`address` im Ledger sind
   reine Zuordnungshilfe, keine Datenquelle für On-Chain-Analysen.

8. **Decimal-Arithmetik für alle Geld- und BTC-Beträge** (`decimal.js`), niemals `number`.
   Rundung ausschließlich bei der Anzeige, BTC mit 8 Nachkommastellen.

9. **Positionen mit ungeklärter Herkunft** werden nie stillschweigend einer Steuerkategorie
   zugeordnet, sondern explizit als „nicht bewertbar" ausgewiesen.

---

## Konventionen

- **i18n:** keine hartkodierten Strings, alles über next-intl (DE/EN).
- **Datum:** Zeitpunkte (ISO-8601 mit Zone) und Kalenderdaten (`YYYY-MM-DD`) strikt
  trennen, nur über `lib/dates.ts`. Für Kalenderdaten nie `toISOString()` oder `Date` als
  Transportformat. Steuerliche Tageszuordnung in `Europe/Berlin` (`docs/dates.md`).
- **Theming:** Farben ausschließlich über Design-Tokens/CSS-Variablen, nie feste Farbwerte.
  Muss in allen Themes funktionieren.
- **Barrierefreiheit:** Gewinn/Verlust nie allein über Farbe kodieren (Vorzeichen oder Pfeil
  ergänzen). `prefers-reduced-motion` respektieren. Tastaturbedienbarkeit sicherstellen.
- **Dateizugriff:** File System Access API mit Feature-Detection, sauberer Fallback über
  Upload/Download für Safari/Firefox. Handles gehören in IndexedDB, nicht in localStorage.
- **Persistenz von Einstellungen:** in `uiSettings` der Portfolio-Datei, damit sie mit der
  Datei portabel sind; gespiegelt in localStorage nur, wenn sie vor dem Öffnen einer Datei
  greifen müssen (z. B. Theme). Gebündelt speichern, nicht bei jeder Interaktion.
- **Reine Funktionen mit Unit-Tests** für FIFO, Herkunftsauflösung, Bestandsberechnung und
  Steuerlogik. Diese Bereiche nicht ohne Tests ändern.
- **Datenmodell versionieren** (`version`), neue Felder immer optional einführen, damit
  bestehende Dateien ohne Migration gültig bleiben.
- **Steuerangaben** stets mit dem Hinweis versehen, dass die App keine Steuerberatung
  ersetzt.

---

## Gestaltungshaltung

Für Produktentscheidungen, nicht nur Optik:

- Gamification belohnt **Sorgfalt und Sicherheit, niemals Handelsaktivität**. Keine
  Anreize, häufiger zu kaufen, zu verkaufen oder die App zu öffnen.
- Keine Bestenlisten, kein Vergleich mit anderen Nutzern, keine Serien mit Verlustdruck.
- Beim Teilen und Exportieren absolute Beträge standardmäßig ausblenden — die Bestandsgröße
  ist ein Sicherheitsrisiko.
- Datenqualität sichtbar machen statt Lücken zu kaschieren: fehlende Verknüpfungen,
  ungeklärte Herkunft und veraltete Backups gehören angezeigt, nicht weggerechnet.

---

## Orientierung im Code

<!-- Beim ersten Einsatz ausfüllen und aktuell halten -->

- `…` — Datenmodell und Typen
- `…` — Persistenz, Verschlüsselung, Datei-Handling
- `…` — FIFO, Herkunftsauflösung, Steuerlogik
- `…` — CSV-Import
- `…` — Dashboard und Widget-Registry
- `config/import-presets/` — System-Presets (read-only, schema-validiert)
- `config/news-feeds/` — Standard-Feedliste des Nachrichten-Widgets
  (read-only, schema-validiert; zugleich die Freigabeliste der Proxy-Route)
- `lib/news/`, `app/api/news/` — Nachrichten-Widget und Feed-Proxy (siehe `docs/news.md`)

## Befehle

<!-- Beim ersten Einsatz ausfüllen -->

- `npm run dev` / `npm run build` / `npm test`
- `npm run build:server` — Build mit Feed-Proxy statt Static Export (`docs/deployment.md`)
- `npm run dev` bindet die Feed-Proxy-Route ein; `npm run dev:export` entspricht dem Static Export
- `npm run config:validate` — alle Konfigurationsdateien gegen ihr Schema prüfen
  (`presets:validate` + `feeds:validate`); läuft in `build` und `lint` mit
- `npm run help:screenshots` — Hilfe-Screenshots aus dem Testportfolio neu erzeugen