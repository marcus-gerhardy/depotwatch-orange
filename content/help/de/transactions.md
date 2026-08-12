# Transaktionen erfassen
Die fünf Typen, und wann welcher der richtige ist.

## Die fünf Transaktionstypen {#tx-types}
- **Kauf** — du gibst Euro und bekommst Bitcoin. Erzeugt ein neues Lot (eine Position mit eigenem Kaufdatum und Einstandspreis).
- **Verkauf** — du gibst Bitcoin und bekommst Euro. Steuerlich ein Veräußerungsgeschäft.
- **Übertrag raus** — Bitcoin verlässt ein Konto: entweder zu einem eigenen anderen Konto oder an eine fremde Adresse.
- **Übertrag rein** — Bitcoin kommt auf einem Konto an.
- **Ausgabe** — du bezahlst mit Bitcoin. Steuerlich wie ein Verkauf.

![Die Transaktionstabelle mit Datum, Typ, Wallet, Menge, Kurs und Wert je Zeile](/help/screenshots/transactions.png)

> Ein Übertrag zwischen deinen eigenen Wallets ist **kein** Verkauf und löst keine Steuer aus. Erfasse ihn als Übertrag, nicht als Verkauf-und-Kauf, sonst zerstörst du deine Haltefristen.

## Preis oder Betrag {#tx-price}
Bei Kauf, Verkauf und Ausgabe genügt eines von beiden: Kurs pro BTC **oder** Gesamtbetrag in Euro. Das jeweils andere rechnet die App aus.

Erfasst du beides, gilt der Gesamtbetrag als das, was tatsächlich geflossen ist.

## Gebühren {#tx-fees}
Gebühren stehen **neben** dem Betrag, nicht darin:

- Eine **BTC-Gebühr** kommt oben drauf. Ein Kauf über 0,1 BTC mit 0,001 BTC Gebühr schreibt dem Konto 0,099 BTC gut. Ein Verkauf oder Übertrag über 0,1 BTC mit 0,001 BTC Gebühr belastet es mit 0,101 BTC.
- Eine **Euro-Gebühr** erhöht beim Kauf den Einstand und mindert beim Verkauf den Erlös.

Diese Regel gilt überall gleich; der CSV-Import rechnet abweichende Konventionen aus Exportdateien darauf um.

## In anderer Währung abgerechnet {#tx-currency}
Hast du gegen USDT oder Dollar gekauft, kannst du das dokumentieren: Währung, Betrag und Kurs in der Originalwährung stehen in einem eigenen Abschnitt des Dialogs.

Diese Angaben sind **reine Dokumentation**. Gerechnet wird immer in Euro — Haltefristen, Gewinne und alle Auswertungen lesen ausschließlich die Euro-Felder. Fehlt der Euro-Wert, kann ihn die App auf Knopfdruck aus dem historischen Tageskurs ableiten; solche Werte sind mit „≈" markiert.

## On-Chain-Daten {#tx-onchain}
Bei Überträgen kannst du **Transaktions-ID** und **Adresse** hinterlegen. Beides ist optional und dient dem Wiederfinden und dem Verknüpfen von Aus- und Eingang.

Fehlt eine Angabe auf einer Seite, übernimmt die App sie vom Gegenstück, sofern das eindeutig ist. Die Sicherheitsfunktionen der App lesen diese Felder **nicht** — die arbeiten ausschließlich mit der [Adress-Watchlist](/hilfe/watchlist).
