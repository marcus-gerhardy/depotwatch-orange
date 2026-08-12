# Einstellungen
Was sich einstellen lässt und wo es steht.

## Aufbau {#settings-groups}
Die Einstellungen sind in Gruppen geteilt, links auswählbar: **Allgemein**, **Darstellung**, **Sicherheit**, **Backups**, **Änderungsverlauf**, **Import**, **Steuer** und **Explorer**.

![Die Einstellungen mit der Gruppenliste links und den Karten der gewählten Gruppe rechts](/help/screenshots/settings.png)

Fast alles davon liegt **in der Portfolio-Datei** und wandert mit ihr. Sprache und Farbschema werden zusätzlich im Browser gemerkt, damit Startbildschirm und Rechtstexte auch ohne geöffnete Datei richtig aussehen.

## Sprache und Anzeigewährung {#settings-language}
Deutsch und Englisch, umschaltbar im laufenden Betrieb.

Die Anzeigewährung kennt drei Werte: **EUR**, **USD** und **BTC**. BTC ist dabei eine **Anzeigeeinheit**, keine Bewertungswährung — Beträge erscheinen in Sats, gerechnet und gespeichert wird weiterhin in Euro. Kurse werden trotzdem in Fiat geholt.

## Darstellung {#settings-theme}
Neun Farbschemata, darunter zwei helle. „Dem System folgen" wählt anhand der Systemeinstellung zwischen einem hellen und einem dunklen Schema.

Die Option **farbsehfreundlich** ersetzt das Grün für Gewinne durch ein Blau, das sich von der Verlustfarbe unterscheidet. Richtung wird ohnehin nie allein über Farbe angezeigt: Es steht immer ein Pfeil davor.

Beim Drucken wird immer das helle Schema verwendet.

## Änderungsverlauf {#settings-changelog}
Die Datei merkt sich die letzten 50 Änderungen: wann, welche Art, wie viele Transaktionen. Einzelne Aktionen lassen sich von dort zurücknehmen.

Das ist **keine Datensicherung** — dafür sind die [Backups](/hilfe/backups) da. Es ist die Antwort auf „ich habe gerade zu viel gelöscht". Sehr große Aktionen werden protokolliert, aber nicht rücknehmbar, damit die Datei nicht wächst.

## Explorer-Quelle {#settings-explorer}
Für On-Chain-Abfragen: der öffentliche Dienst (Standard) oder ein eigener Server.

> Beim öffentlichen Dienst erfährt der Anbieter, welche Adressen du beobachtest. Ein eigener Electrum- oder Esplora-Server vermeidet das vollständig.

## Autosave {#settings-autosave}
Im automatischen Modus wird nach einer kurzen Pause geschrieben, statt bei jedem Tastendruck. Die Verzögerung ist einstellbar; kürzer heißt öfter verschlüsseln und schreiben.
