# Rail 3 Mobile — Log of Changes (LLD decisions)

Low-level design decisions for the Rail 3 mobile app, recorded per the Product Trio
Hands/Tech-Lead convention. One entry per material decision.

## W178 — Tenant theming: custom React Context (not react-native-paper) — S0-008

**Decision:** Implement `ThemeProvider` as a custom React Context + `useTheme()` hook
(`mobile/src/theme/ThemeProvider.tsx`), rather than adopting `react-native-paper`'s
`PaperProvider`/`MD3Theme`.

**Why:**
- The app carries only three brand fields (`primary_color`, `accent_color`,
  `logo_url`) plus the club name. A full UI-kit theming system is dead weight for
  that surface area in a PoC.
- The screens already style with plain `StyleSheet`; Paper would mean either
  migrating components to Paper primitives or running two theming systems in
  parallel. Neither is justified.
- A Context + hook mirrors the web app's lightweight tenant-config fetch
  (`admin/src/pages/rider/AuthPage.tsx`) with **no new dependency**.

**Trade-off:** If Rail 3 later needs Material components (elevation, ripples,
themed inputs at scale), revisit Paper then. The `useTheme()` surface is small, so
swapping the provider implementation later is low-cost.

**Notes:**
- Brand columns are American spelling in the `tenants` table (`primary_color`,
  `accent_color`) — the W178 ticket text said `*_colour`; the table is the source
  of truth.
- Tenant resolved at runtime from `EXPO_PUBLIC_TENANT_SLUG` (env), never a
  hard-coded UUID. Anon can read `tenants` (`tenant_public_select_policy`), so
  branding loads pre-auth on the sign-in screen.
