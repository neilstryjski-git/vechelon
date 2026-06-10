// Reads Expo public env vars. EXPO_PUBLIC_* are inlined at build time, mirroring
// the admin/ web app's VITE_SUPABASE_* convention (admin/src/lib/supabase.ts).
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

// The club/tenant slug this build serves. The web app derives this from the
// subdomain hostname; a native build has no hostname, so it comes from config.
// This is runtime config (env), NOT a hardcoded literal in logic — see the W178
// no-hardcoded-tenant pitfall. Passed to the send-magic-link edge function so it
// brands the email for the right club.
export const TENANT_SLUG = process.env.EXPO_PUBLIC_TENANT_SLUG ?? '';

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
