# Steuern
Was die App für die deutsche Besteuerung rechnet — und was sie nicht kann.

## Keine Steuerberatung {#tax-disclaimer}
> DepotWatch Orange ist ein Werkzeug, keine Steuerberatung. Die App rechnet nach den Regeln, die du ihr vorgibst, und kann weder deine persönliche Situation beurteilen noch Rechtsänderungen kennen. Für die Abgabe verantwortlich bist du; im Zweifel frag eine Steuerberaterin oder einen Steuerberater.

## Haltefrist {#tax-holding}
Private Veräußerungsgeschäfte mit Bitcoin sind nach § 23 EStG steuerfrei, wenn zwischen Anschaffung und Veräußerung **mehr als ein Jahr** liegt. Die Frist steht in den Einstellungen und ist änderbar, falls sich die Rechtslage ändert.

Entscheidend ist das **ursprüngliche Kaufdatum**, nicht der Tag, an dem Coins irgendwo angekommen sind. Die App verfolgt das über beliebig viele Überträge zurück, sofern die Zuordnungen gepflegt sind.

Im Steuerbereich siehst du je offener Position, wann sie steuerfrei wird, und wie viel gerade steuerfrei realisierbar wäre.

## FIFO und die Lot-Zuordnung {#tax-fifo}
Die Reihenfolge, in der Positionen verbraucht werden, ergibt sich aus **deiner Zuordnung** beim Verkauf, nicht aus einer Automatik. Die Rechenmaschine wertet aus, was zugeordnet ist: Einstand, Haltedauer und Gewinn je Teilmenge.

Wenn du steuerlich nach FIFO vorgehen willst, ordnest du beim Verkauf die ältesten Positionen zu — die Auswahltabelle lässt sich dafür nach Kaufdatum sortieren. Siehe [Verkäufe](/hilfe/sales).

## Freigrenze {#tax-freigrenze}
Gewinne aus privaten Veräußerungsgeschäften bleiben steuerfrei, solange sie im Kalenderjahr **unter der Freigrenze** liegen (aktuell 1.000 €, davor 600 €). Der Betrag steht in den Einstellungen, weil der Gesetzgeber ihn ändert und eine alte Datei ihre damalige Grenze behalten soll.

**Freigrenze, nicht Freibetrag:** Wird sie um einen Euro überschritten, ist der **gesamte** Gewinn steuerpflichtig, nicht nur der überschreitende Teil. Das Dashboard-Widget zeigt den Stand des laufenden Jahres.

## Was die App liefert {#tax-export}
Der Steuerbereich zeigt offene Positionen, Veräußerungen des Jahres, steuerpflichtige und steuerfreie Anteile — und exportiert das als CSV für deine Unterlagen oder deine Beraterin.

![Der Steuerbereich mit offenen Positionen, Haltefristen und den Veräußerungen des Jahres](/help/screenshots/tax.png)

Positionen, deren Herkunft nicht auflösbar ist, werden **nicht** einfach mitgezählt, sondern getrennt als „Herkunft ungeklärt" ausgewiesen. Eine Haltefrist, die auf einem geratenen Datum beruht, wäre die eine Angabe, die man hier nicht machen darf.
