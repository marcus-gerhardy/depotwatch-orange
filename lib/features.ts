/**
 * Build-time feature flags.
 *
 * Tax reporting (German holding-period rules, disposal list, open-lot status)
 * is a stage-2 feature. The engine stays fully implemented and tested in
 * `lib/fifo.ts` — it keeps computing lot allocations, cost basis, and holding
 * periods, because the persisted `lotAllocations` depend on it — but every
 * tax-specific surface is removed from the UI while this flag is off:
 *
 * - "Tax" navigation tab and TaxView
 * - tax-status column and "only tax-free" filter in the transaction table
 * - tax-free-gain figure on the dashboard
 * - tax settings card (holding period, cost-basis method)
 *
 * Flip to `true` to bring all of it back.
 */
export const TAX_FEATURES_ENABLED = false;
