import { supabase } from './supabase';

/**
 * Returns the calling user's deterministic 12-char base32 rider hash.
 * Computed server-side (rider-hash EF) using a Vault secret so the raw
 * HMAC key never touches the browser. Result is stable per user account.
 */
export async function getRiderHash(): Promise<string> {
  const { data, error } = await supabase.functions.invoke('rider-hash');
  if (error) throw error;
  if (!data?.hash) throw new Error('rider-hash: unexpected empty response');
  return data.hash as string;
}
