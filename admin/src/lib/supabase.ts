import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('[Vechelon] Supabase env vars missing — real-time features disabled. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to admin/.env')
}

// Use placeholder URL so createClient doesn't throw when env vars are absent.
// Real-time channels will silently no-op until valid credentials are provided.
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
)
