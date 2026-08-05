/**
 * Build-time feature flags.
 *
 * Tax reporting (German holding-period rules, disposal list, open-lot status)
 * covers these surfaces:
 *
 * - "Tax" navigation tab and TaxView
 * - tax-status column and "only tax-free" filter in the transaction table
 * - holding-period status in the origin list of an incoming transfer
 * - tax-free-gain figure on the dashboard
 * - tax settings card (holding period, cost-basis method)
 *
 * Every holding period behind them comes from the *resolved original*
 * acquisition date, never from the date coins arrived somewhere: the FIFO
 * engine traces lot identity across internal transfers, and where that trace
 * dead-ends the affected position is reported as "origin unresolved" instead of
 * being valued against an arrival date (CLAUDE.md §3.2, `lib/provenance.ts`).
 *
 * Flip to `false` to remove all of it from the UI again; the engine keeps
 * running either way, because the persisted `lotAllocations` depend on it.
 */
export const TAX_FEATURES_ENABLED = true;
