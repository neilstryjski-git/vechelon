import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import DeleteAccountPanel from './DeleteAccountPanel';

vi.mock('../lib/supabase', () => ({ supabase: { functions: { invoke: vi.fn() }, auth: { getUser: vi.fn(), signOut: vi.fn() } } }));

describe('DeleteAccountPanel', () => {
  afterEach(cleanup);

  it('cancel at the explanation step calls nothing', () => {
    const run = vi.fn();
    render(<DeleteAccountPanel run={run} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }));
    expect(screen.getByText('What is deleted')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Delete account' })).toBeTruthy();
    expect(run).not.toHaveBeenCalled();
  });

  it('the delete button stays disabled until DELETE is typed, and cancel there calls nothing', () => {
    const run = vi.fn();
    render(<DeleteAccountPanel run={run} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    const del = screen.getByRole('button', { name: 'Delete my account' }) as HTMLButtonElement;
    expect(del.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/to permanently delete/), { target: { value: 'DELET' } });
    expect(del.disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(run).not.toHaveBeenCalled();
  });

  it('typing DELETE and confirming runs the deletion once and reports success', async () => {
    const run = vi.fn(async () => ({ outcome: { ok: true as const, signedOut: true }, steps: [] }));
    const onDeleted = vi.fn();
    render(<DeleteAccountPanel run={run} onDeleted={onDeleted} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.change(screen.getByLabelText(/to permanently delete/), { target: { value: ' delete ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Delete my account' }));
    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('a refusal shows the server message and keeps the rider on the confirm step', async () => {
    const run = vi.fn(async () => ({
      outcome: { ok: false as const, reason: 'last_admin' as const, message: 'You’re the only organiser of Club X.' },
      steps: [],
    }));
    const onDeleted = vi.fn();
    render(<DeleteAccountPanel run={run} onDeleted={onDeleted} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.change(screen.getByLabelText(/to permanently delete/), { target: { value: 'DELETE' } });
    fireEvent.click(screen.getByRole('button', { name: 'Delete my account' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'You’re the only organiser of Club X.');
    expect(onDeleted).not.toHaveBeenCalled();
  });
});
