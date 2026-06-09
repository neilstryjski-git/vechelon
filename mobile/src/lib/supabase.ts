// react-native-url-polyfill MUST be imported before @supabase/supabase-js so that
// URL/URLSearchParams exist in the Hermes runtime (supabase-js relies on them).
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

import { SUPABASE_URL, SUPABASE_ANON_KEY, isSupabaseConfigured } from './env';

// React Native client. Differences from the web client (admin/src/lib/supabase.ts):
//   - storage: AsyncStorage — RN has no localStorage, so sessions persist here
//     across cold starts (acceptance criterion: session survives cold start).
//   - persistSession + autoRefreshToken: keep the session alive between launches.
//   - detectSessionInUrl: false — RN has no window.location; inbound magic-link
//     URLs arrive via the deep-link handler (see lib/deepLinkAuth.ts), same posture
//     as the web app which also disables URL auto-detection.
//   - flowType: 'pkce' — matches the web app and uses exchangeCodeForSession().
//
// When env is absent we pass placeholders so createClient does not throw at module
// load (which would white-screen the app). The env.ts warning already fired; the
// app renders the sign-in screen and auth calls fail with a clear error instead of
// an opaque crash — mirroring the web client's graceful-degradation posture.
export const supabase = createClient(
  isSupabaseConfigured ? SUPABASE_URL : 'https://placeholder.supabase.co',
  isSupabaseConfigured ? SUPABASE_ANON_KEY : 'placeholder-anon-key',
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
  },
);
