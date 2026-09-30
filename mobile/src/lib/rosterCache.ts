// W281 — hook point for the single-slot offline roster cache (Ledger R3-58 last clause;
// built by W289). This module exists so the ORDER is fixed before the cache is: the cache
// clears on the auth transition, which AuthContext runs AFTER the departure has been issued
// under the outgoing identity's still-valid JWT. W289 replaces the body; it must not move the
// call site. Kept free of react-native / supabase imports so the sequence is node-testable.

export function clearRosterCache(): void {
  // no-op until W289 lands the encrypted single-slot cache
}
