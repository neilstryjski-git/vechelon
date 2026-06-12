import React, { createContext, useContext, useEffect, useState } from 'react';

import { supabase } from '../lib/supabase';
import { TENANT_SLUG } from '../lib/env';

// Rail 3 tenant theming (W178 / Pillar II §5.2, Pillar III R3-18, SD-014).
//
// LLD decision (S0-008): custom React Context, NOT react-native-paper. The app's
// screens use plain StyleSheet with a handful of brand colours; pulling in a full
// UI-kit ThemeProvider just to carry three fields (primary/accent/logo) is dead
// weight for the PoC. A Context + hook mirrors the web app's lightweight tenant-
// config fetch (admin/src/pages/rider/AuthPage.tsx) without a new dependency.
// Recorded in mobile/log_of_changes.md.

export type Theme = {
  primaryColor: string;
  accentColor: string;
  logoUrl: string | null;
  clubName: string;
};

// Sensible fallbacks = the app's original hard-coded identity. Used until the brand
// fetch resolves, and per-field whenever a tenant's brand column is null (pitfall:
// provide fallbacks when brand fields are null — never blank the UI).
export const DEFAULT_THEME: Theme = {
  primaryColor: '#E11D2A',
  // A neutral secondary that stays legible on the dark background — matches the
  // app's existing subtitle grey, so a tenant with no accent set looks unchanged.
  accentColor: '#9A9A9A',
  logoUrl: null,
  clubName: 'Vechelon',
};

const ThemeContext = createContext<Theme>(DEFAULT_THEME);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [theme, setTheme] = useState<Theme>(DEFAULT_THEME);

  useEffect(() => {
    let mounted = true;

    // Resolve the tenant at runtime from the build's slug (env config — NOT a
    // hard-coded UUID; a hard-coded staging id is exactly what turns the
    // staging->prod switch into a hunt-and-replace migration). Mirrors the web
    // rider AuthPage tenant-config query. Anon can read tenants
    // (tenant_public_select_policy: public SELECT true), so branding loads before
    // sign-in — the club's identity shows at the front door.
    if (!TENANT_SLUG) return;

    supabase
      .from('tenants')
      .select('name, primary_color, accent_color, logo_url')
      .eq('slug', TENANT_SLUG)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!mounted || error || !data) return;
        // Merge non-null brand fields over the defaults so a tenant with a null
        // column keeps the fallback rather than blanking that surface.
        setTheme({
          primaryColor: data.primary_color || DEFAULT_THEME.primaryColor,
          accentColor: data.accent_color || DEFAULT_THEME.accentColor,
          logoUrl: data.logo_url || null,
          clubName: data.name || DEFAULT_THEME.clubName,
        });
      });

    return () => {
      mounted = false;
    };
  }, []);

  // Provide defaults immediately and update on fetch — never gate render on the
  // network call, so branding-loading never white-screens the app.
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
};

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
