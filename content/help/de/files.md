# Datei öffnen, speichern, sperren
Wie die Portfolio-Datei geöffnet, gespeichert und verschlüsselt wird — und was passiert, wenn du länger nichts tust.

## Öffnen und Speichern {#files-open}
Beim Öffnen wählst du deine Portfolio-Datei aus und gibst das Passwort ein. Danach hängt das Speichern davon ab, was dein Browser kann:

- **Chrome, Edge, Opera** unterstützen die File System Access API. Die App behält den Zugriff auf die Datei und schreibt Änderungen automatisch zurück. Du musst nichts speichern.
- **Firefox und Safari** können das nicht. Dort öffnest du die Datei per Dateiauswahl und speicherst über den Knopf **Datei speichern**, der die Datei als Download ausgibt. Der Knopf ist orange, solange es ungespeicherte Änderungen gibt.

Welcher Modus aktiv ist, steht in den Einstellungen unter *Sicherheit*.

## Verschlüsselung und Passwortwechsel {#files-encryption}
Die Verschlüsselung passiert vor dem Schreiben: Auf der Platte liegt nie Klartext, wenn ein Passwort gesetzt ist.

Das Passwort änderst du unter **Einstellungen → Sicherheit → Passwort ändern**. Wichtig dabei: Bestehende **Backups behalten das alte Passwort**, denn sie wurden damit verschlüsselt. Lege nach einem Wechsel gleich ein frisches Backup an — die App bietet das direkt an.

## Automatisch sperren {#files-autolock}
Nach einer einstellbaren Zeit ohne Eingabe sperrt sich die App: Vorher werden ungespeicherte Änderungen geschrieben, danach werden die entschlüsselten Daten **und das Passwort aus dem Speicher entfernt**. Zum Entsperren wird die Datei neu entschlüsselt, also brauchst du das Passwort erneut.

- Einstellbar unter **Einstellungen → Sicherheit**: 1, 5, 15 oder 30 Minuten oder „nie".
- Optional zusätzlich: sperren, sobald der Tab in den Hintergrund geht.
- Sperren von Hand: der Schloss-Knopf im Kopfbereich oder **Strg/Cmd + L**.
- 30 Sekunden vorher erscheint ein Hinweis mit Countdown und dem Knopf **Entsperrt bleiben**.

> Eine **unverschlüsselte Datei kann nicht gesperrt werden**. Ohne Passwort gäbe es nichts, womit sich sperren ließe, und ein bloß ausgeblendetes Fenster wäre kein Schutz. Vergib ein Passwort, dann greift die Sperre.

## Wenn die Datei beschädigt ist {#files-damaged}
Beim Speichern schreibt die App eine Prüfsumme mit in die Datei, beim Öffnen wird sie geprüft. Passt sie nicht, wird die Datei **nicht** stillschweigend geöffnet: Du bekommst eine Meldung, was nicht stimmt, und den direkten Weg zu einem Backup.

Dasselbe gilt für abgeschnittene Dateien (ein unterbrochener Schreibvorgang) und für Dateien, die gar keine Portfolio-Dateien sind.
