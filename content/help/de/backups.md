# Backups und Wiederherstellung
Eine Datei ist ein Ausfallpunkt. Deshalb schreibt die App verschlüsselte Kopien — und liest jede sofort wieder ein.

## Backup-Ordner einrichten {#backup-folder}
Backups liegen in einem Ordner, den du **einmalig auswählst**: **Einstellungen → Backups → Backup-Ordner wählen**.

Warum ein eigener Ordner nötig ist: Der Zugriff auf deine Portfolio-Datei erlaubt technisch nur diese eine Datei, keine Nachbardateien. Für zusätzliche Kopien braucht der Browser deshalb die Erlaubnis für ein Verzeichnis.

Nach einem Neustart des Browsers fragt dieser den Zugriff einmal neu ab — dafür gibt es den Knopf **Zugriff erneut erlauben**.

> Browser ohne File System Access API (Firefox, Safari) können keinen Ordner öffnen. Dort gibt es Backups nur als **Download, den du selbst anstößt**. Die App sagt das an dieser Stelle auch, statt automatische Backups vorzutäuschen.

## Wann Backups geschrieben werden {#backup-trigger}
Einstellbar unter **Einstellungen → Backups**:

- **Bei jedem Speichern** — die gründlichste Variante, erzeugt viele Dateien.
- **Einmal täglich** (Standard) — beim ersten Speichern des Tages.
- **Nur manuell** — ausschließlich über den Knopf *Backup jetzt erstellen*.

Der Dateiname enthält den Zeitstempel, etwa `portfolio-2026-08-12T14-32-05.dwp`. Backups sind vollwertige Portfolio-Dateien und mit demselben Passwort verschlüsselt wie das Original.

## Jedes Backup wird geprüft {#backup-verify}
Nach dem Schreiben liest die App die Datei **sofort wieder ein**, entschlüsselt sie, prüft die Prüfsumme und vergleicht die Transaktionszahl mit dem Original. Erst dann gilt das Backup als verifiziert.

Der Status steht in den Einstellungen und im Widget *Datenqualität*. Schlägt die Prüfung fehl, wird das deutlich gesagt — ein Backup, auf das man sich nicht verlassen kann, ist gefährlicher als gar keines.

## Aufbewahrung {#backup-retention}
Alte Backups werden automatisch ausgedünnt: die letzten zehn, dazu je eines pro Tag der letzten Woche, pro Woche des letzten Monats und pro Monat des letzten Jahres.

Zwei Sicherungen stehen über der Regel: Das **jüngste Backup wird nie gelöscht**, und es wird überhaupt nichts gelöscht, solange nicht mindestens ein **verifiziertes** Backup übrig bleibt.

## Wiederherstellen {#backup-restore}
Unter **Einstellungen → Backups** siehst du alle gefundenen Backups mit Zeitpunkt und Größe. Nach Eingabe des Passworts zeigt *Inhalt prüfen*, wie viele Transaktionen darin stehen und wie aktuell sie sind.

![Die Backup-Liste mit Zeitpunkt, Größe und den Knöpfen zum Prüfen und Wiederherstellen](/help/screenshots/settings-backups.png)

1. Backup auswählen und auf **Wiederherstellen** klicken.
2. Der Dialog stellt beide Seiten gegenüber: aktuell geöffnete Datei und Backup, jeweils mit Transaktionszahl und Stand.
3. Vor dem Ersetzen schreibt die App **automatisch ein Backup des aktuellen Zustands** und verifiziert es. Damit lässt sich auch die Wiederherstellung wieder rückgängig machen.

> Ältere Backups können ein **früheres Passwort** haben, wenn du das Passwort zwischendurch geändert hast.
