// Reads Expo public env vars. EXPO_PUBLIC_* are inlined at build time, mirroring
// the admin/ web app's VITE_SUPABASE_* convention (admin/src/lib/supabase.ts).
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

// W303 — the build is no longer pinned to one club. These two slugs drive the runtime
// active-club rule (lib/clubResolution.ts): a PRIMARY-club member uses the primary club;
// anyone else uses (and is auto-joined to) the FALLBACK club. Runtime config (env), NOT
// literals in logic — see the W178 no-hardcoded-tenant pitfall. On prod, FALLBACK must be
// a demo club: Bikes and Beers is a real prod club with real members.
// (EXPO_PUBLIC_TENANT_SLUG keeps its historical name; it now means the PRIMARY club.)
export const PRIMARY_CLUB_SLUG = process.env.EXPO_PUBLIC_TENANT_SLUG ?? '';
export const FALLBACK_CLUB_SLUG = process.env.EXPO_PUBLIC_FALLBACK_CLUB_SLUG ?? '';

// W303 — the single Google Play reviewer identity (lib/reviewerAccess.ts). Staging only;
// leave unset in any build that should have no reviewer path.
export const REVIEWER_EMAIL = process.env.EXPO_PUBLIC_REVIEWER_EMAIL ?? '';

// Hosted privacy policy (W224) — linked in-app for Play compliance. Single source
// so SignInScreen (pre-auth) and HomeScreen (post-auth) stay in sync.
export const PRIVACY_POLICY_URL = 'https://vechelon.productdelivered.ca/privacy';

export const isSupabaseConfigured = Boolean(
  SUPABASE_URL &&
    SUPABASE_ANON_KEY &&
    SUPABASE_URL !== 'https://placeholder.supabase.co',
);

if (!isSupabaseConfigured) {
  // Match the web app's loud warning so a missing .env is obvious in Metro logs.
  console.warn(
    '[Rail3] Supabase env vars missing — set EXPO_PUBLIC_SUPABASE_URL and ' +
      'EXPO_PUBLIC_SUPABASE_ANON_KEY (see .env.example).',
  );
}
