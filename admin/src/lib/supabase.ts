import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

const isConfigured = Boolean(supabaseUrl && supabaseAnonKey)

if (!isConfigured) {
  console.warn('[Vechelon] Supabase env vars missing — App running in Mock Mode.')
}

// Create a safe proxy that no-ops if not configured
export const supabase = isConfigured 
  ? createClient(supabaseUrl, supabaseAnonKey)
  : (new Proxy({}, {
      get: () => () => ({
        select: () => ({
          limit: () => ({
            maybeSingle: () => Promise.resolve({ data: null, error: null }),
            single: () => Promise.resolve({ data: null, error: null }),
          }),
          eq: () => ({
            single: () => Promise.resolve({ data: null, error: null }),
          }),
          order: () => ({
            limit: () => Promise.resolve({ data: [], error: null }),
          })
        }),
        on: () => ({ subscribe: () => ({}) }),
        channel: () => ({ on: () => ({ subscribe: () => ({}) }), send: () => ({}) }),
      })
    }) as any);
