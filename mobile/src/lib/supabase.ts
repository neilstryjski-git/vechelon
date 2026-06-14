// react-native-url-polyfill MUST be imported before @supabase/supabase-js so that
// URL/URLSearchParams exist in the Hermes runtime (supabase-js relies on them).
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, processLock } from '@supabase/supabase-js';

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
      // W194 hardening: serialize token refreshes through an in-memory lock. The
      // foreground app and the headless background-location TaskManager task
      // (lib/backgroundLocation.ts) both construct this client over ONE shared
      // AsyncStorage session; a single-use refresh-token rotation racing across
      // them is the prime suspect for a sender "going Dark" ~1h into a ride. With
      // a lock, each refresh re-loads the session from storage before rotating, so
      // a holder picks up another's freshly-rotated token instead of replaying a
      // consumed one. CAVEAT: processLock is per-JS-context (in-memory) and the
      // FGS task runs in a SEPARATE context — this fully serializes WITHIN each
      // context and leans on the AppState foreground/background handoff to keep the
      // two contexts from refreshing at once. Residual cross-context race is the #1
      // thing the >60-min token-survival field test (§5) must watch.
      lock: processLock,
    },
  },
);
