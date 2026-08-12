# UTXO-Verwaltung
Einzelne Coins beschriften, Staub erkennen, sinnvoll zusammenlegen.

## Was ein UTXO ist {#utxo-what}
Bitcoin kennt keine Kontostände, sondern **unverbrauchte Ausgänge**: einzelne Beträge, die je für sich ausgegeben werden. Dein „Bestand" ist die Summe deiner UTXOs.

Das ist kein Detail für Fortgeschrittene: Welche UTXOs du beim Bezahlen zusammenwirfst, entscheidet darüber, was ein Beobachter über dich erfährt, und wie viel Gebühr du zahlst.

## Beschriften (Coin Control) {#utxo-labels}
Jedem UTXO kannst du ein Label und Tags geben — Herkunft, `kyc` oder `non-kyc`, welches Wallet. Die Labels liegen in deiner Portfolio-Datei.

Der Nutzen zeigt sich beim Ausgeben: Wer weiß, welche Coins von einer KYC-Börse stammen, kann vermeiden, sie mit anderen zusammen auszugeben.

## Staub erkennen {#utxo-dust}
Ein UTXO ist „Staub", wenn seine Ausgabe mehr Gebühr kosten würde, als er wert ist. Die App markiert solche Ausgänge, gemessen an den aktuellen Gebühren.

Staub, den dir jemand ungefragt geschickt hat, ist oft ein Markierungsversuch. Ihn einfach liegen zu lassen ist meistens die richtige Antwort.

## Zusammenlegen {#utxo-consolidate}
Viele kleine UTXOs machen spätere Zahlungen teuer. Sie zu einem zusammenzulegen kostet einmal Gebühr — am besten dann, wenn das Netz billig ist.

Das Gebühren-Widget auf dem Dashboard sagt bei niedrigen Gebühren dazu, dass gerade ein guter Moment dafür ist.
