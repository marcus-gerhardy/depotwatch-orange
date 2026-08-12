# Häufige Fragen
Was schiefgehen kann und was dann zu tun ist.

## Mein Bestand stimmt nicht {#faq-balance}
Der angezeigte Bestand kommt immer aus deinen Transaktionen: Käufe und Eingänge minus Verkäufe, Ausgänge und Ausgaben, mit den BTC-Gebühren nach der üblichen Regel.

Stimmt er nicht mit deiner Börse überein, prüfe in dieser Reihenfolge:

1. Fehlen Transaktionen? Der letzte Import könnte durch einen Zeilenfilter zu wenig übernommen haben.
2. Sind Gebühren doppelt gerechnet? Im Importschritt entscheidet die Gebührenfrage darüber, ob ein Betrag brutto oder netto gemeint war.
3. Gibt es Überträge, deren Gegenstück fehlt? Das Widget **Datenqualität** zählt sie.

## „Nicht abgedeckte Veräußerung" {#faq-uncovered}
Ein Verkauf, ein Übertrag oder eine Ausgabe ohne Lot-Zuordnung. Die App ordnet nie selbst zu — siehe [Verkäufe](/hilfe/sales).

Solange das offen ist, liegt die Summe der offenen Positionen über dem tatsächlichen Bestand, und das Dashboard sagt das. Öffne die betroffene Transaktion und ordne die Positionen zu; der Filter in der Transaktionstabelle findet sie.

## „Herkunft ungeklärt" {#faq-unresolved}
Ein Eingang, dessen zugehöriger Ausgang fehlt oder nicht verknüpft ist. Die App weigert sich, das Ankunftsdatum als Kaufdatum zu behandeln — das würde die Haltefrist verfälschen.

Öffne den Eingang und verknüpfe ihn mit dem passenden Ausgang. Findet die App keinen Kandidaten, kannst du den fehlenden Ausgang aus den Positionen des Quellkontos direkt anlegen.

## Ich habe mein Passwort vergessen {#faq-password}
Dann ist die Datei nicht mehr zu öffnen — auch nicht von uns. Es gibt keine Hintertür, das ist der Sinn der Verschlüsselung.

Prüfe, ob ein **Backup** mit einem älteren Passwort existiert; nach einem Passwortwechsel behalten alte Backups das alte.

## Ich habe zu viel gelöscht {#faq-undo}
Unter **Einstellungen → Änderungsverlauf** stehen die letzten Änderungen, einzeln zurücknehmbar. Das gilt auch für Löschungen, die nebenbei Lot-Zuordnungen aufgelöst haben.

Für große Aktionen oder ältere Stände: [Backup wiederherstellen](/hilfe/backups).

## Kurse werden nicht geladen {#faq-prices}
Kurse kommen von einer öffentlichen Schnittstelle. Ohne Internet, mit blockierenden Erweiterungen oder bei Ratenbegrenzung bleibt die Kachel leer und zeigt einen Fehler.

Alles, was aus deiner Datei kommt — Bestand, Zuordnungen, Haltefristen —, funktioniert davon unabhängig weiter.

## Funktioniert die App offline? {#faq-offline}
Ja. Öffnen, Erfassen, Auswerten und Speichern brauchen kein Netz. Ohne Netz fehlen nur Kurse und On-Chain-Daten, und die Hilfe hier funktioniert ebenfalls vollständig offline.
