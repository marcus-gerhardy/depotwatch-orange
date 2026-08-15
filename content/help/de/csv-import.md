# CSV-Import
Exportdateien von Börsen einlesen, Schritt für Schritt.

## Ablauf im Überblick {#csv-overview}
Der Assistent führt durch fünf Schritte:

1. **Datei und Preset** — Datei wählen, danach ein Vorlage-Preset oder „ohne Preset".
2. **Zeilenfilter** — nur bestimmte Zeilen übernehmen, etwa nur `trade`.
3. **Spalten zuordnen** — welche CSV-Spalte welches Feld füllt.
4. **Werte zuordnen** — welcher Text welchen Transaktionstyp bedeutet.
5. **Vorschau** — jede Zeile so, wie sie gebucht würde, mit Warnungen und Duplikaten.

Erst der letzte Schritt schreibt etwas in dein Portfolio.

## Presets {#csv-presets}
Ein **Preset** hält alles fest, was der Assistent fragt — Trennzeichen, Datumsformat, Spaltenzuordnung, Gebühren-Konventionen. Der nächste Import derselben Export-Art besteht damit nur noch aus Datei auswählen und prüfen.

**Eigene Presets** speicherst du am Ende selbst. Sie liegen **in deiner Portfolio-Datei**, wandern also mit ihr auf andere Geräte und gehen bei einem Browserwechsel nicht verloren.

**Erkannt wird eine Datei an ihrer Kopfzeile.** Beim Speichern merkt sich ein Preset die Spaltenüberschriften der Datei, mit der es funktioniert hat. Lädst du später eine Datei mit denselben Spalten, schlägt der Assistent das Preset vor und wendet es an — Groß- und Kleinschreibung, Leerzeichen und die Spaltenreihenfolge spielen dabei keine Rolle, und zusätzliche Spalten stören nicht. Passen mehrere Presets, wird das mit der neuesten Formatversion angewendet und die übrigen stehen zum Wechseln daneben.

**Presets weitergeben.** Unter *Einstellungen → Import → Import-Presets* verwaltest du sie: umbenennen, duplizieren, löschen, als JSON exportieren und ein geteiltes Preset aus JSON übernehmen. Vordefinierte Presets kommen mit der App und sind schreibgeschützt; brauchst du eine abweichende Variante, duplizierst du sie als eigenes Preset.

> Ein exportiertes Preset enthält ausschließlich die Konfiguration: keine Transaktionen, Beträge, Adressen oder Dateinamen. Was nach Daten statt nach Einstellung aussieht, wird vor dem Export entfernt und dir aufgezählt.

## Spalten zuordnen {#csv-mapping}
Die App schlägt eine Zuordnung anhand der Spaltenüberschriften vor; prüfen musst du sie trotzdem.

**Datum und Uhrzeit** sind zwei Felder mit eigenem Format. Hat deine Datei eine einzige Zeitstempel-Spalte, wählst du sie in beiden Feldern aus und stellst das Zeitformat auf „aus Datum/Zeit". Enthält ein Wert eine Zeitzone (`+02:00`, `Z`), wird sie berücksichtigt.

**Einheiten** stellst du pro Feld ein: BTC oder Sats für Mengen, BTC oder Sats für Gebühren.

**Zeichensatz und Trennzeichen** stehen im ersten Schritt: UTF-8, ISO-8859-1 oder ISO-8859-15, Komma oder Semikolon, Punkt oder Komma als Dezimaltrennzeichen. Falsche Umlaute in der Vorschau bedeuten fast immer den falschen Zeichensatz.

## Gebühren richtig deuten {#csv-fees}
Exporte sind sich uneinig, ob eine Gebühr im Betrag schon enthalten ist. Direkt an der Gebührenspalte fragt der Assistent deshalb nach:

- **BTC-Gebühr**: „schon vom Betrag abgezogen?" — getrennt für Eingänge und Ausgänge, weil eine Datei durchaus beides verwenden kann.
- **Euro-Gebühr**: „schon im Betrag enthalten?"

Die Vorschau zeigt in einer eigenen Spalte, was am Ende gebucht wird. Stimmt die Summe nicht mit deinem Kontostand, ist fast immer hier der Fehler.

## Duplikate {#csv-duplicates}
Eine zweimal importierte Datei verdoppelt den Bestand, ohne dass etwas kaputt aussieht. Dagegen gibt es zwei Prüfungen:

- **Die Datei**: Ihre Prüfsumme wird mit früheren Importen verglichen. Kommt sie bekannt vor, warnt die App mit Datum und Anzahl des früheren Laufs.
- **Die Zeilen**: Jede Zeile wird gegen das Zielkonto und gegen die vorherigen Zeilen derselben Datei geprüft — gleiche Transaktions-ID, oder identische Werte, oder identische Werte innerhalb einer Zeittoleranz (einstellbar, Standard 2 Minuten).

**Nichts wird automatisch verworfen.** Eine Verdopplung kann echt sein. Duplikate werden markiert, auf „nicht importieren" vorbelegt und verlinkt auf die kollidierende Transaktion; entscheiden tust du.

## Import rückgängig machen {#csv-undo}
Jeder Import wird protokolliert. Unter **Einstellungen → Import** siehst du die Läufe und kannst einen davon entfernen.

Was ein späterer Vorgang bereits benutzt hat — ein Lot, aus dem verkauft wurde, oder ein Transfer, dessen Gegenstück bleibt — wird dabei **nicht** entfernt und einzeln benannt.
