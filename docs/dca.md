# Sparplanrechner (DCA)

Eigenständiger Rechner im Hauptmenü. Code: `lib/dca/` (reine Funktionen, Tests in
`lib/dca/dca.test.ts`), Oberfläche in `components/dca/`.

## Abgrenzung zum Portfolio

- Liest und schreibt die Portfolio-Datei nicht und setzt nie `dirty`.
- Die zuletzt verwendeten Eingaben liegen deshalb **nicht** in `uiSettings`, sondern in
  `localStorage` (`depotwatch.dcaCalculator.v1`, `lib/dca/storage.ts`), gespeichert
  einmal pro Klick auf „Berechnen“. Bewusste Ausnahme von der uiSettings-Konvention.

## Kurse (`lib/dca/prices.ts`)

- Konvention: **Schlusskurs der UTC-Tageskerze** (Binance-Klines `1d`, Feld `close`),
  geschlüsselt nach UTC-Kalendertag. Laufende Kerze (closeTime ≥ jetzt) wird verworfen.
- BTC/EUR ab der ersten verfügbaren Kerze (Anfang 2020).
- Davor BTC/USDT ÷ EZB-Referenzkurs EUR/USD über `api.frankfurter.dev`; Tage ohne
  Referenzkurs nehmen den zuletzt veröffentlichten. USDT = 1 USD.
- Frühestes Startdatum: `EARLIEST_PRICE_DAY` = 2017-08-17 (erste BTC/USDT-Kerze).
- Paginierung zu je 1000 Kerzen mit Fortschrittsmeldung. Die Serie wird pro UTC-Tag im
  Speicher gecacht; ein Fehlschlag wird nicht gecacht. Nichts davon wird persistiert.
- Abruf nur auf Klick (Invariante 1).

## Kauftage (`lib/dca/schedule.ts`)

- Start- und Enddatum inklusive; Kalenderarithmetik aus `lib/dates.ts`.
- Monatlich/quartalsweise: k-ter Kauf = Startdatum + k (bzw. 3k) Monate, jedes Mal vom
  Startdatum aus gerechnet, fehlender Tag → letzter Tag des Monats
  (`addCalendarMonths`). 31.01. → 29.02. → 31.03., kein dauerhaftes Abrutschen.
- Fehlende Kerze an einem Kauftag → nächste verfügbare Kerze (`priceDay` ≠ `date`).

## Historie und Projektion (`lib/dca/simulate.ts`)

- Grenze ist der letzte Tag mit abgeschlossener Kerze. Käufe bis einschließlich dieses
  Tages zu echten Kursen, danach zum Modellkurs des Szenarios.
- Bewertung am Enddatum: letzter Kurs am oder vor dem Enddatum, sonst Modell.
- Power Law (`lib/dca/powerLaw.ts`): OLS von log10(Kurs EUR) gegen log10(Tage seit
  2009-01-03) über alle geladenen Tage. Band = Mittelwert ×/÷ 10^w, Vorschlag
  w = 2 Standardabweichungen der Residuen. Parameter im UI sichtbar und änderbar.
- Mit Projektionsanteil wird jede Kennzahl für unteres Band, Mittelwert und oberes Band
  berechnet.

## Kennzahlen

- Gebühr wird vom Kaufbetrag abgezogen; „investiert“ enthält die Gebühr.
- Ø Kaufkurs = Σ netto ÷ Σ Menge (mengengewichtet, ohne Gebühren).
- IRR (`lib/dca/irr.ts`): XIRR mit Tagen/365, Decimal, Newton mit Bisektions-Rückfall.
- Alles in Decimal; gerundet wird nur bei der Anzeige. Die Diagrammdaten
  (`chartData.ts`) sind reine Anzeige und daher `number`.
