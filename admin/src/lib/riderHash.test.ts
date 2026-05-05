import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock supabase before importing riderHash
vi.mock('./supabase', () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
  },
}));

import { getRiderHash } from './riderHash';
import { supabase } from './supabase';

const mockInvoke = supabase.functions.invoke as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockInvoke.mockReset();
});

describe('getRiderHash', () => {
  it('returns the hash on success', async () => {
    mockInvoke.mockResolvedValueOnce({ data: { hash: 'abcdefghij12' }, error: null });
    const hash = await getRiderHash();
    expect(hash).toBe('abcdefghij12');
    expect(mockInvoke).toHaveBeenCalledWith('rider-hash');
  });

  it('throws when the Edge Function returns an error', async () => {
    const efError = new Error('EF failed');
    mockInvoke.mockResolvedValueOnce({ data: null, error: efError });
    await expect(getRiderHash()).rejects.toThrow('EF failed');
  });

  it('throws when data.hash is missing', async () => {
    mockInvoke.mockResolvedValueOnce({ data: {}, error: null });
    await expect(getRiderHash()).rejects.toThrow('rider-hash: unexpected empty response');
  });
});
