# Dashboard
Arranging, adding and resetting the tiles.

## What the dashboard shows {#dash-overview}
The dashboard is a grid of widgets: value and change, profit and loss, price, the stack over time, buying behaviour, fees, holding periods, data quality, watchlist and more.

![The dashboard with tiles for portfolio value, profit and loss, BTC price, sats stack, average cost and custody](/help/screenshots/dashboard.png)

Every widget computes from your file; only prices and on-chain figures come from outside. A widget that cannot fetch anything shows its own error and leaves the rest alone.

## Arranging widgets {#dash-edit}
Moving and resizing only work in **edit mode** (the button at the top right) — so nothing shifts by accident.

- Dragging by the widget's **header** moves it; the controls inside stay clickable.
- The bottom-right corner resizes it, within the limits that make sense for that widget.
- A **+** in an empty area opens the picker and places the chosen widget exactly there.
- The **×** on a widget removes it.

On narrow screens (below 768 px) the grid becomes a single column and edit mode is unavailable.

## Saving and resetting the layout {#dash-layout}
The arrangement lives **in your portfolio file**, not in the browser: the same file looks the same on another device.

It is written once at the end of an editing session, not on every drag. **Reset layout** restores the default arrangement with all widgets.

## Notices above the grid {#dash-warnings}
Above the tiles you may find notices that concern the whole portfolio: a negative holding, unusable amounts, or disposals without a lot assignment. They do not belong in a single widget, because they are about the whole file.
