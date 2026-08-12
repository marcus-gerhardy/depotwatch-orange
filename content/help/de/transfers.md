# Überträge zwischen Wallets
Wie Bitcoin von einem Konto auf ein anderes kommt, ohne die Haltefrist zu verlieren.

## Warum ein Übertrag kein Verkauf ist {#transfer-why}
Wenn du Bitcoin von der Börse auf dein Hardware-Wallet schickst, hast du nichts verkauft. Kaufdatum und Einstandspreis bleiben erhalten — und damit die Haltefrist.

Damit die App das nachvollziehen kann, braucht sie zwei Angaben: **welche Käufe** der Ausgang mitnimmt (Lot-Zuordnung) und **welcher Eingang** dazugehört (Verknüpfung).

## Übertrag anlegen {#transfer-create}
Im Übertragen-Dialog wählst du Quellkonto, Zielkonto, Menge und Netzwerkgebühr. Die App legt beide Seiten an: einen Ausgang im Quellkonto und einen Eingang im Zielkonto, verbunden über eine gemeinsame Kennung.

Die Netzwerkgebühr gehört zum Ausgang. Beim Ziel kommt der Betrag ohne Gebühr an — genau so, wie es on-chain passiert.

## Lot-Zuordnung {#transfer-lots}
Ein Ausgang muss sagen, **aus welchen Käufen** die Coins stammen. Die App wählt das **niemals selbst** aus, und das ist Absicht: Eine geratene Zuordnung entscheidet still über Haltefristen und Gewinne.

Im Dialog wählst du die Lots in einer Tabelle aus — neueste zuerst, sortierbar, durchsuchbar, mehrfach auswählbar. Ein Übertrag, der zwölf Sparplan-Käufe zusammenfasst, ist damit eine Auswahl statt zwölf Vorgänge.

Die Summe der zugeordneten Lots muss **Betrag + Netzwerkgebühr** ergeben. Eine Abweichung wird angezeigt, blockiert aber nichts: Ein halb zugeordneter Import ist ein legitimer Zwischenstand.

## Aus- und Eingang verknüpfen {#transfer-link}
Kommen die beiden Seiten aus verschiedenen Importen, sind sie zunächst unverbunden. Verknüpfen kannst du sie **vom Eingang aus**: Der Dialog schlägt passende Ausgänge anderer Konten vor, sortiert nach Übereinstimmung — eine identische Transaktions-ID gilt als Beweis, danach zählen Betrag und Datum.

Die Differenz zwischen beiden Beträgen ist im Normalfall die Netzwerkgebühr; die App bietet an, sie zu übernehmen. Ist die Differenz größer als ein Prozent, ist es vermutlich der falsche Partner, und die App sagt das.

## Herkunft ansehen {#transfer-provenance}
Jeder Übertrag lässt sich in der Transaktionstabelle aufklappen. Darunter steht, **aus welchen ursprünglichen Käufen** die Menge besteht: Kaufdatum, anteilige Menge, ursprünglicher Einstand, Herkunftskonto und Haltefrist-Status.

Das funktioniert über beliebig viele Zwischenstationen: Börse → Hardware-Wallet → anderes Hardware-Wallet behält den ursprünglichen Kauf.

Lässt sich die Herkunft nicht auflösen, sagt die App „Herkunft ungeklärt" statt ein Datum zu erfinden. Solche Positionen erscheinen in der Datenqualität und lassen sich von dort aus reparieren.
