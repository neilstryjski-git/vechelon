import * as Linking from 'expo-linking';

import { supabase } from './supabase';

// Establishes a Supabase session from an inbound magic-link deep link.
//
// We run the PKCE flow (see lib/supabase.ts), so the magic link returns a `?code=`
// query param — Linking.parse exposes that in `params`, and we exchange it below.
// The implicit-flow branch (access_token / refresh_token) is a defensive fallback
// for any token that arrives as a query param; note Linking.parse does NOT expose
// the URL `#fragment`, so a legacy `#access_token=` link would not be handled here
// (not a concern under our PKCE config). Mirrors admin AuthPage.tsx's dual handling.
//
// Returns the established session, or null when the URL carries no auth payload
// (e.g. an ordinary deep link), so callers can ignore non-auth URLs.
export async function createSessionFromUrl(url: string) {
  const { params, errorCode } = Linking.parse(url);

  if (errorCode) {
    throw new Error(`Magic-link error: ${errorCode}`);
  }

  // PKCE flow — exchange the authorization code for a session.
  const code = typeof params.code === 'string' ? params.code : undefined;
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    return data.session;
  }

  // Implicit flow fallback — set the session directly from the tokens.
  const accessToken =
    typeof params.access_token === 'string' ? params.access_token : undefined;
  const refreshToken =
    typeof params.refresh_token === 'string' ? params.refresh_token : undefined;
  if (accessToken && refreshToken) {
    const { data, error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) throw error;
    return data.session;
  }

  return null;
}

// The deep link the magic-link email should redirect back to. In a Dev Build this
// resolves to `rail3://auth` (the scheme declared in app.json); under `expo start`
// it resolves to the Expo dev URL. This exact value must be on the Supabase Auth
// "Redirect URLs" allowlist for the magic link to return to the app (see README).
export const authRedirectUrl = Linking.createURL('auth');
