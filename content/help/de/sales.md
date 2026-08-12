# Verkäufe und Lot-Auswahl
Was beim Verkaufen passiert und warum du die Position selbst auswählst.

## Verkauf erfassen {#sale-create}
Ein Verkauf braucht Datum, Konto, Menge und Erlös. Zusätzlich braucht er die Angabe, **aus welchen Käufen** die verkaufte Menge stammt — die Lot-Zuordnung.

Der Dialog bietet die Auswahl direkt an, sodass du sie sofort beantworten kannst. Du kannst sie auch später nachtragen: Die Transaktion bleibt bis dahin als unvollständig markiert.

## Warum die App nicht automatisch zuordnet {#sale-no-auto}
Andere Programme setzen stillschweigend „FIFO" und ordnen den ältesten Kauf zu. Diese App tut das bewusst **nicht**.

Der Grund: Eine automatische Zuordnung entscheidet unsichtbar über Haltefrist, Einstand und steuerpflichtigen Gewinn — und sie entscheidet **anders**, sobald sich irgendwo weiter vorn etwas ändert. Zwei Auswertungen derselben Datei wären sich dann uneinig darüber, was verkauft wurde.

Deshalb: Die Zuordnung wird einmal von dir getroffen, dauerhaft gespeichert und **nie nachträglich neu berechnet**.

## Lots auswählen {#sale-pick}
Die Auswahltabelle zeigt alle offenen Positionen des Kontos mit Kaufdatum, Restmenge, Einstand und Haltefrist-Status.

- Sortierung und Suche helfen beim Finden; die Reihenfolge der Tabelle ist zugleich die Priorität beim automatischen Auffüllen.
- Mehrfachauswahl ist möglich, wenn ein Verkauf mehrere Käufe abdeckt.
- Die vorgeschlagenen Mengen kannst du danach von Hand ändern.

Willst du steuerlich nach FIFO vorgehen, sortierst du nach Kaufdatum aufsteigend und wählst von oben. Willst du gezielt eine bereits steuerfreie Position verkaufen, sortierst du nach Haltefrist.

## Was die App daraus rechnet {#sale-fifo}
Aus den zugeordneten Lots ergeben sich Einstand, Haltedauer und Gewinn — je Teilmenge, weil ein Verkauf aus mehreren Käufen stammen kann.

Die Rechenmaschine verbraucht **ausschließlich das, was zugeordnet ist**. Eine Veräußerung ohne Zuordnung schließt keine Position, hat keinen Einstand und wird als „nicht abgedeckt" ausgewiesen. Solange das so ist, liegt die Summe der offenen Positionen über dem tatsächlichen Bestand — das ist der ehrliche Zustand der Datei und verschwindet, sobald du zuordnest.

> Was daraus steuerlich folgt, steht unter [Steuern](/hilfe/tax). Die App ersetzt keine Steuerberatung.
