# Adress-Watchlist und Sicherheit
Adressen beobachten, ohne dass jemand deine Schlüssel braucht.

## Watch-only und getrennt vom Buchungsteil {#watch-concept}
Die Watchlist ist eine **eigene Liste** von Bitcoin-Adressen oder xpubs, die du beobachten willst. Sie hat mit deinen erfassten Transaktionen bewusst nichts zu tun.

Der Grund: Buchhaltungspositionen und tatsächliche UTXOs lassen sich nicht zuverlässig 1:1 abbilden — mehrere Käufe landen oft in einem einzigen UTXO. Deshalb rechnet der Buchungsteil mit deinen Angaben und der Sicherheitsteil mit den Daten der Blockchain, ohne dass eines das andere verfälscht.

## Adresse hinzufügen {#watch-add}
Unter **Watchlist** trägst du Adresse oder xpub ein, dazu ein Label und optional Tags wie `kyc` oder `hardware-wallet`.

![Die Adress-Watchlist mit beobachteten Adressen, Labels und Tags](/help/screenshots/watchlist.png)

> Ein **xpub** gibt die gesamte Transaktionshistorie einer Wallet preis, nicht nur eine Adresse. Trage ihn nur ein, wenn dir das bewusst ist.

## Was geprüft wird {#watch-checks}
- **Adress-Wiederverwendung** — dieselbe Adresse mehrfach als Empfänger verwendet.
- **Public-Key-Leak** — bei Legacy-Adressen wird der öffentliche Schlüssel beim ersten Ausgeben sichtbar.
- **Address Poisoning** — Staubbeträge von optisch ähnlichen Adressen, ein verbreiteter Betrugsversuch.
- **Adresstyp** — Hinweis auf modernere Formate (SegWit, Taproot) mit besserer Privatsphäre und niedrigeren Gebühren.
- **Privacy-Score** — heuristische Einschätzung je UTXO.

## Woher die Daten kommen {#watch-explorer}
On-Chain-Daten holt die App von dem Explorer, der in den Einstellungen steht — standardmäßig mempool.space.

> Dabei erfährt der Anbieter, **welche Adressen dich interessieren**, verbunden mit deiner IP-Adresse. Das ist der Preis eines öffentlichen Dienstes. Wer das vermeiden will, trägt unter **Einstellungen → Explorer** einen eigenen Server ein; dann verlässt keine Adresse dein Netz.

Portfoliodaten werden dabei nie übertragen — nur die Adressen, die du selbst eingetragen hast.
