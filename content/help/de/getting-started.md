# Erste Schritte
Von der leeren Datei zur ersten erfassten Transaktion, in vier Schritten.

## Portfolio-Datei anlegen {#gs-create}
DepotWatch Orange speichert nichts auf einem Server. Dein gesamtes Portfolio liegt in **einer Datei auf deinem Gerät**, die du selbst verwaltest.

Auf dem Startbildschirm gibt es dafür zwei Wege:

1. **Neues Portfolio anlegen** legt eine leere Datei an und führt dich durch Speicherort, Passwort und das erste Wallet.
2. **Testportfolio laden** öffnet ein vollständig gefülltes Beispiel, an dem du alles gefahrlos ausprobieren kannst. Es liegt nur im Arbeitsspeicher; sobald du es änderst, fragt die App nach einem Speicherort.

> Wie die App ohne Server funktioniert und warum das sicherer ist, steht auf der Seite [So funktioniert's](/so-funktionierts).

## Passwort wählen {#gs-password}
Das Passwort verschlüsselt die Datei (AES-256-GCM, Schlüsselableitung mit PBKDF2). Es gibt **keine Wiederherstellung**: Ohne Passwort ist die Datei verloren, auch für dich.

- Nimm ein langes Passwort, das du dir merken kannst, oder speichere es in einem Passwortmanager.
- Ein Portfolio ohne Verschlüsselung ist möglich, aber die Datei ist dann für jeden lesbar, der sie in die Hände bekommt.
- Ohne Passwort kann die App auch nicht automatisch sperren, weil es nichts gibt, womit sie sperren könnte.

## Erstes Wallet und Konto {#gs-first-wallet}
Die Struktur ist zweistufig: Ein **Wallet** ist ein Ort, an dem Bitcoin liegt (eine Börse, ein Hardware-Wallet, eine Software-Wallet, ein Paper-Wallet). Ein **Konto** ist ein Bereich darin.

Beispiel: Wallet „Börse" mit den Konten „Spot" und „Sparplan", Wallet „Hardware-Wallet" mit dem Konto „Konto 1".

Wenn du dir unsicher bist: Ein Wallet mit einem Konto genügt für den Anfang, weitere kannst du jederzeit ergänzen.

## Erste Transaktion erfassen {#gs-first-tx}
Wechsle zu **Transaktionen** und klicke auf **Transaktion erfassen**. Für einen Kauf brauchst du Datum, Konto, BTC-Menge und den Preis oder den Eurobetrag — eines von beiden genügt, das andere rechnet die App aus.

![Der Dialog „Transaktion erfassen“ mit den Feldern Typ, Datum, Konto, Menge, Kurs und Betrag](/help/screenshots/transaction-form.png)

Danach zeigt das Dashboard sofort Bestand, Einstandskurs und Wert.

> Hast du einen Export von deiner Börse? Dann ist der [CSV-Import](/hilfe/csv-import) schneller als das Abtippen.
