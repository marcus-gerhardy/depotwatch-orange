# Datum und Zeit: Zeitpunkte und Kalenderdaten

Die App kennt zwei grundverschiedene Arten von „Datum“. Sie werden strikt getrennt
gespeichert, gelesen und berechnet. Alle Hilfsfunktionen liegen in `lib/dates.ts`.

## Zeitpunkte (Instants)

Ein Punkt auf der Zeitachse, z. B. der Zeitstempel einer Transaktion, der Zeitpunkt
eines Backups oder eines Meilensteins.

- Gespeichert als vollständiger ISO-8601-String mit Zeitzonenbezug (`2026-03-15T09:00:00.000Z`).
- Lesen/Schreiben: `parseInstant` / `serializeInstant`.
- Anzeige in der lokalen Zone des Nutzers (`formatDate`, `formatDateTime` in `lib/i18n`).

## Kalenderdaten

Ein Tag im Kalender, der für jeden Betrachter derselbe ist.

| Feld / Stelle | Ort |
|---|---|
| Sparziel-Zieldatum | `settings.savingsGoal.targetDate` |
| Backup geprüft am | `wallet.backupCheckedAt` |
| Stichtag und Zeitraum der Stichtagsansicht | `lib/pointInTime.ts` |
| Erster steuerfreier Tag eines Lots | `OpenLot.taxFreeDay` |
| Jahresgrenzen (Steuerjahr, Jahresrückblick) | `yearOfInstant`, `startOfYear`, `endOfYear` |

- Gespeichert als reiner String `YYYY-MM-DD`.
- Lesen/Schreiben: `parseCalendarDate` / `serializeCalendarDate`; Prüfung mit `isCalendarDate`.
- Arithmetik ausschließlich über Tagesnummern: `addCalendarDays`, `addCalendarYears`,
  `calendarDaysBetween`. Niemals Millisekunden addieren.
- Anzeige über `formatCalendarDate` (formatiert in UTC, damit der gespeicherte Tag
  angezeigt wird, egal in welcher Zone der Browser läuft).
- **Verboten für Kalenderdaten:** `toISOString()`, `getTimezoneOffset()`, `new Date("YYYY-MM-DD")`
  und `Date`-Objekte als Transportformat. Der Wert eines `<input type="date">` wird
  unverändert als String gespeichert.

Ursprünglicher Fehler: Das Sparziel-Formular hat `new Date("2026-12-31T00:00:00").toISOString()`
gespeichert. In Berlin ergibt das `2026-12-30T23:00:00.000Z`, und `slice(0, 10)` las daraus
den 30.12. Jedes erneute Speichern verschob das Datum um einen weiteren Tag.

## Vom Zeitpunkt zum Kalendertag: die Referenzzone

Wenn ein Zeitpunkt einem Kalendertag zugeordnet werden muss, ist entscheidend, in welcher
Zone das geschieht.

- **Steuerlich relevante Zuordnungen** verwenden die feste Referenzzone
  `REFERENCE_TIME_ZONE = "Europe/Berlin"` (deutsches Steuerrecht, deutsche Kalendertage).
  Das gilt für Haltefrist-Beginn und -Ablauf, „heute“ beim Fristvergleich, Steuerjahr
  (Steuerseite, Freigrenzen-Tracker, Meilenstein „Jahresabschluss“), Stichtagsansicht
  (Tagesende 24:00 Uhr Berlin) und Jahresrückblick. Das Ergebnis hängt so nicht davon
  ab, wo sich der Nutzer gerade aufhält.
- **Anzeigebezogene Zuordnungen** verwenden die lokale Zone, weil dort auch die Daten
  angezeigt werden: Datumsfilter der Transaktionsliste, des Lot-Pickers und der
  Transfer-Verknüpfung, die Kauf-Heatmap sowie „heute“ beim Backup-Prüfdatum.
- Tageskurse (Binance-Kerzen) und die tägliche Bestandsreihe sind nach UTC-Tagen
  geschlüsselt; ein Kalenderdatum wird für die Kurssuche als UTC-Tag nachgeschlagen.

## Haltefrist (§ 23 EStG, Fristberechnung nach §§ 187, 188 BGB)

`firstTaxFreeDay(acquiredDay, holdingPeriodDays)` in `lib/dates.ts`:

- Die Frist beginnt am Tag nach der Anschaffung und endet mit Ablauf des Tages im
  Folgejahr, der dem Anschaffungstag entspricht. Kauf am 15.03.2025 → Fristende
  15.03.2026 → steuerfrei ab 16.03.2026. Ein Verkauf am 15.03.2026 ist noch steuerpflichtig.
- Gerechnet wird in Kalenderjahren („gleiches Datum im Folgejahr“), nicht mit 365 Tagen
  oder Millisekunden. Die frühere Rechnung (+366 Tage) war über jeden 29. Februar
  hinweg einen Tag zu früh steuerfrei (z. B. Kauf 01.03.2023 → richtig steuerfrei ab
  02.03.2024, nicht 01.03.2024).
- **Kauf am 29. Februar:** Im Folgejahr fehlt dieser Tag, die Frist endet daher nach
  § 188 Abs. 3 BGB am 28. Februar; steuerfrei ab **1. März**.
- Der Anschaffungstag ist der Kalendertag des Kaufzeitpunkts in der Referenzzone;
  der Vergleich „Frist abgelaufen“ verwendet ebenfalls den heutigen Tag in der
  Referenzzone (`isLotTaxFree`, `daysUntilTaxFree`).
- Die Einstellung `holdingPeriodDays` (Standard 365) wird bei ganzen Vielfachen von 365
  als entsprechende Anzahl Kalenderjahre gelesen, andere Werte als Tage.

Die App ersetzt keine Steuerberatung.

## CSV-Import ohne Uhrzeit

Ein reiner Datumswert (`31.12.2025`, `2025-12-31`) wird als **12:00 Uhr in der Referenzzone**
gespeichert. Damit ist der Tag für Haltefrist und Steuerjahr korrekt und wird in allen Zonen
von UTC−10 bis UTC+12 als derselbe Tag angezeigt. Bisher wurde lokale Mitternacht
gespeichert, die westlich der Importzone als Vortag erschien. Die Duplikat-Erkennung
erkennt Zeilen früherer Importe (lokale oder UTC-Mitternacht) weiterhin.

## Altdaten

Dateien älterer Versionen können Kalenderdaten als Zeitpunkt enthalten. `readStoredCalendarDate`
liest sie als Kalendertag in der lokalen Zone, also als den Tag, der ursprünglich gewählt
wurde. `lib/calendarDateRepair.ts` erkennt solche Werte. Der Dialog `CalendarDateRepairDialog`
(erreichbar über das Datenqualitäts-Widget und die Sparziel-Einstellungen) zeigt eine
Vorschau (gespeichert, bisher angezeigt, korrigiert), legt vor der Korrektur ein Backup an
und schreibt nur nach ausdrücklicher Bestätigung. Transaktionszeitstempel werden dabei
nicht verändert.

## Tests

`lib/dates.test.ts` und `components/SettingsView.dates.test.tsx` laufen in UTC,
Europe/Berlin, America/New_York und Asia/Tokyo (`process.env.TZ` wird zur Laufzeit
gesetzt). Abgedeckt sind das Speichern und Wiederlesen eines Kalenderdatums,
Jahresendgrenzen, Haltefrist-Ablauf am Grenztag und Schaltjahrfälle.
