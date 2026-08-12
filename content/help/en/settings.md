# Settings
What can be configured, and where it is.

## How it is organised {#settings-groups}
The settings are split into groups, selectable on the left: **General**, **Appearance**, **Security**, **Backups**, **Change history**, **Import**, **Tax** and **Explorer**.

![The settings with the group list on the left and the selected group's cards on the right](/help/screenshots/settings.png)

Almost all of it lives **in the portfolio file** and travels with it. Language and colour theme are additionally remembered in the browser, so the start screen and the legal pages look right without a file open.

## Language and display currency {#settings-language}
German and English, switchable while you work.

The display currency has three values: **EUR**, **USD** and **BTC**. BTC is a **display unit**, not a valuation currency — amounts appear in sats, while everything is calculated and stored in euros. Prices are still fetched in fiat.

## Appearance {#settings-theme}
Nine colour themes, two of them light. "Follow the system" picks between a light and a dark theme according to your system setting.

The **colour-vision-friendly** option replaces the green for gains with a blue that stays apart from the loss colour. Direction is never shown by colour alone anyway: there is always an arrow in front of it.

Printing always uses the light theme.

## Change history {#settings-changelog}
The file remembers its last 50 changes: when, what kind, how many transactions. Single actions can be taken back from there.

This is **not a backup** — that is what the [backups](/help/backups) are for. It is the answer to "I just deleted too much". Very large actions are recorded but not reversible, so the file does not grow.

## Explorer source {#settings-explorer}
For on-chain queries: the public service (default) or your own server.

> With the public service the provider learns which addresses you are watching. Your own Electrum or Esplora server avoids that entirely.

## Autosave {#settings-autosave}
In automatic mode writing happens after a short pause rather than on every keystroke. The delay is configurable; shorter means encrypting and writing more often.
