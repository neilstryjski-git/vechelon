import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

const isConfigured = Boolean(supabaseUrl && supabaseAnonKey && supabaseUrl !== 'https://placeholder.supabase.co')

if (!isConfigured) {
  console.warn('[Vechelon] Supabase env vars missing — App running in Mock Mode.')
}

/**
 * A robust recursive proxy that safely handles any Supabase call.
 * Returns empty data/errors instead of throwing.
 */
function createSafeProxy(): any {
  const noop: any = () => {}
  
  // The recursive handler
  const handler: ProxyHandler<any> = {
    get(target, prop) {
      // Handle Thenable/Promise behavior to prevent hangs during 'await'
      if (prop === 'then') {
        return (onFulfilled: any) => Promise.resolve({ data: null, error: null, count: 0 }).then(onFulfilled);
      }

      // Special case for methods that return promises
      if (['maybeSingle', 'single', 'getSession', 'getUser', 'invoke'].includes(prop as string)) {
        return () => Promise.resolve({ data: null, error: null })
      }
      
      // Special case for real-time
      if (prop === 'on' || prop === 'subscribe' || prop === 'channel' || prop === 'send') {
        return () => createSafeProxy()
      }

      // If the property hasn't been accessed yet, return another proxy
      if (!(prop in target)) {
        target[prop] = createSafeProxy()
      }
      return target[prop]
    },
    // Make the proxy callable (e.g., supabase.from('table'))
    apply(_target, _thisArg, _argumentsList) {
      return createSafeProxy()
    }
  }

  return new Proxy(Object.assign(noop, {}), handler)
}

// Admin-generated magic links always produce implicit (hash-based) tokens,
// so we must use implicit flow to detect #access_token= on redirect.
export const supabase: SupabaseClient = isConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, { auth: { flowType: 'implicit' } })
  : createSafeProxy();
