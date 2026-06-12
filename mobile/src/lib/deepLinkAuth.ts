import * as Linking from 'expo-linking';

import { supabase } from './supabase';

// Establishes a Supabase session from an inbound magic-link deep link.
//
// Our magic link is generated server-side by the send-magic-link edge function
// (auth.admin.generateLink, the prod path). When the user taps it, Supabase's
// /auth/v1/verify endpoint redirects to `rail3://auth` with the session in the URL
// FRAGMENT (#access_token=...&refresh_token=...) — the implicit flow. expo-linking's
// Linking.parse only exposes the query string, NOT the `#` fragment, so we parse the
// fragment ourselves and setSession from it. (URLSearchParams is available via the
// react-native-url-polyfill imported in lib/supabase.ts.)
//
// The `?code=` PKCE branch is retained for completeness (e.g. if a future flow uses
// signInWithOtp/PKCE), but the edge-function path is fragment-based.
//
// Returns the established session, or null when the URL carries no auth payload
// (e.g. an ordinary deep link), so callers can ignore non-auth URLs.
export async function createSessionFromUrl(url: string) {
  const { params, errorCode } = Linking.parse(url);

  if (errorCode) {
    throw new Error(`Magic-link error: ${errorCode}`);
  }

  // Implicit flow (edge-function path) — tokens arrive in the URL fragment.
  const hashIndex = url.indexOf('#');
  if (hashIndex >= 0) {
    const fragment = new URLSearchParams(url.slice(hashIndex + 1));
    const fragError = fragment.get('error_description');
    if (fragError) throw new Error(decodeURIComponent(fragError));

    const accessToken = fragment.get('access_token');
    const refreshToken = fragment.get('refresh_token');
    if (accessToken && refreshToken) {
      const { data, error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (error) throw error;
      return data.session;
    }
  }

  // PKCE flow (?code=) — retained for completeness.
  const code = typeof params.code === 'string' ? params.code : undefined;
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    return data.session;
  }

  return null;
}

// The app's own deep link (`rail3://auth` in a Dev/standalone build; the Expo dev
// URL under `expo start`). Handed to send-magic-link as redirectTo purely to satisfy
// Supabase's generateLink (it validates redirectTo against the uri_allow_list). With
// the D48 OTP flow the user never follows the link — they type the 6-digit code from
// the email into the app, which calls auth.verifyOtp — so Android never has to follow
// an https→rail3:// redirect. createSessionFromUrl above is retained for completeness.
export const authRedirectUrl = Linking.createURL('auth');
