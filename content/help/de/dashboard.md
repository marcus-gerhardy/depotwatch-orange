# Dashboard
Die Kacheln anordnen, hinzufügen und zurücksetzen.

## Was das Dashboard zeigt {#dash-overview}
Das Dashboard ist ein Raster aus Widgets: Wert und Veränderung, Gewinn und Verlust, Kurs, Bestandsverlauf, Kaufverhalten, Gebühren, Haltefristen, Datenqualität, Watchlist und mehr.

![Das Dashboard mit Kacheln für Portfoliowert, Gewinn und Verlust, BTC-Kurs, Sats-Stack, Einstandspreis und Verwahrung](/help/screenshots/dashboard.png)

Jedes Widget rechnet aus deiner Datei; nur Kurse und On-Chain-Daten kommen von außen. Ein Widget, das gerade nichts abrufen kann, zeigt seinen eigenen Fehler und lässt die übrigen in Ruhe.

## Widgets anordnen {#dash-edit}
Verschieben und Größe ändern geht nur im **Bearbeiten-Modus** (Knopf oben rechts) — damit nichts versehentlich verrutscht.

- Ziehen am **Kopf** des Widgets verschiebt es; die Bedienelemente darin bleiben klickbar.
- Die Ecke unten rechts ändert die Größe, innerhalb der für dieses Widget sinnvollen Grenzen.
- Ein **+** in einer freien Fläche öffnet die Auswahl und setzt das gewählte Widget genau dort ein.
- Das **×** am Widget entfernt es.

Auf schmalen Bildschirmen (unter 768 px) wird das Raster einspaltig und der Bearbeiten-Modus ist nicht verfügbar.

## Layout speichern und zurücksetzen {#dash-layout}
Die Anordnung liegt **in deiner Portfolio-Datei**, nicht im Browser: Dieselbe Datei sieht auf einem anderen Gerät gleich aus.

Geschrieben wird einmal am Ende einer Bearbeitung, nicht bei jedem Zug. **Layout zurücksetzen** stellt die Standardanordnung mit allen Widgets wieder her.

## Hinweise über dem Raster {#dash-warnings}
Über den Kacheln erscheinen Hinweise, die das ganze Portfolio betreffen: ein negativer Bestand, unbrauchbare Beträge, oder Veräußerungen ohne Lot-Zuordnung. Sie gehören nicht in ein einzelnes Widget, weil sie die ganze Datei betreffen.
