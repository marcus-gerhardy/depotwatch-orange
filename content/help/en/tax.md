# Taxes
What the app calculates for German taxation — and what it cannot do.

## Not tax advice {#tax-disclaimer}
> DepotWatch Orange is a tool, not tax advice. It calculates by the rules you give it, and can neither judge your personal situation nor know about changes in the law. Filing is your responsibility; when in doubt, ask a tax adviser.

## Holding period {#tax-holding}
Private disposals of bitcoin are tax-free under § 23 EStG when **more than one year** lies between acquisition and disposal. The period is in the settings and can be changed should the law change.

What matters is the **original acquisition date**, not the day coins arrived somewhere. The app follows that back across any number of transfers, as long as the assignments are kept up.

The tax view shows, per open position, when it becomes tax-free, and how much could be realised tax-free right now.

## FIFO and lot assignment {#tax-fifo}
The order in which positions are consumed follows **your assignment** when selling, not an automation. The engine evaluates what is assigned: cost, holding period and gain per part.

If you want to follow FIFO, assign the oldest positions when selling — the picker can be sorted by acquisition date for exactly that. See [Sales](/help/sales).

## The exemption limit {#tax-freigrenze}
Gains from private disposals stay tax-free as long as they are **below the exemption limit** in a calendar year (currently €1,000, previously €600). The figure is in the settings, because the legislator changes it and an older file should keep the figure it was written under.

**A limit, not an allowance:** exceed it by one euro and the **entire** gain is taxable, not just the excess. The dashboard widget shows where the current year stands.

## What the app gives you {#tax-export}
The tax view shows open positions, the year's disposals, taxable and tax-free shares — and exports all of it as CSV for your records or your adviser.

![The tax view with open positions, holding periods and the year's disposals](/help/screenshots/tax.png)

Positions whose origin cannot be resolved are **not** quietly counted, but reported separately as "origin unresolved". A holding period resting on a guessed date would be the one figure you must not state here.
