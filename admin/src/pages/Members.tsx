import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import PageHeader from '../components/PageHeader';
import { useToast } from '../store/useToast';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AccountRole   = 'admin' | 'member' | 'guest';
type AccountStatus = 'initiated' | 'affiliated' | 'archived' | 'deleted';
type ActiveTab     = 'all' | 'validated' | 'pending';

interface MemberRow {
  account_id: string;
  role:       AccountRole;
  status:     AccountStatus;
  joined_at:  string;
  accounts: {
    name:       string | null;
    email:      string;
    phone:      string;
    avatar_url: string | null;
  };
}

// ---------------------------------------------------------------------------
// BDD Scenarios (living documentation)
// ---------------------------------------------------------------------------
//
// Feature: Member Directory Management
//
//   Background:
//     Given I am authenticated as a tenant admin
//
//   Scenario: Viewing all tenant members
//     When I navigate to the Member Directory
//     Then I see all non-archived/deleted accounts for my tenant
//     And the "All" tab count reflects the total
//
//   Scenario: Filtering by validation status
//     Given there are 3 affiliated and 2 initiated members
//     When I click the "Validated" tab
//     Then I see exactly 3 members
//     When I click the "Pending" tab
//     Then I see exactly 2 members
//
//   Scenario: Affiliating a pending member
//     Given a member with status "initiated" exists in my tenant
//     When I click "Affiliate" on that member
//     Then affiliate_member RPC is called with their account_id
//     And the member moves from Pending to Validated
//     And tab counts update immediately via cache invalidation
//
//   Scenario: Non-admin cannot affiliate
//     Given I am authenticated as a regular member
//     When I invoke affiliate_member directly
//     Then I receive "Permission denied: only admins can affiliate members"
//
//   Scenario: Loading state
//     When the member list is fetching
//     Then I see 5 skeleton placeholder rows
//
//   Scenario: Empty pending state
//     Given there are no initiated members
//     When I view the "Pending" tab
//     Then I see "— No pending applications —"
//
//   Scenario: Admin invites a new member (auto-affiliated)
//     Given I am authenticated as a tenant admin
//     When I click "Invite Member" and enter a valid email
//     Then a branded invite email is sent via the invite-member edge function
//     And the recipient's account is pre-created at 'affiliated' status
//     And when the recipient clicks the link they land directly in the portal
//     And they can RSVP to rides immediately — no approval step required
//     If the email already belongs to a member, they are promoted to affiliated

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getInitials(name: string | null): string {
  if (!name) return '?';
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

function tierLabel(role: AccountRole): string {
  return { admin: 'Admin', member: 'Member', guest: 'Guest' }[role];
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Avatar({ name, avatarUrl }: { name: string | null; avatarUrl: string | null }) {
  return (
    <div className="h-10 w-10 rounded-full bg-surface-container-high flex items-center justify-center shrink-0 overflow-hidden">
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={name ?? 'Avatar'}
          className="w-full h-full object-cover"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      ) : (
        <span className="font-label text-xs font-bold text-on-surface-variant">
          {getInitials(name)}
        </span>
      )}
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="grid grid-cols-12 gap-4 px-8 py-6 items-center animate-pulse">
      <div className="col-span-4 flex items-center gap-4">
        <div className="h-10 w-10 rounded-full bg-surface-container-high shrink-0" />
        <div className="h-3 w-32 rounded bg-surface-container-high" />
      </div>
      <div className="col-span-3">
        <div className="h-3 w-28 rounded bg-surface-container-high" />
      </div>
      <div className="col-span-2">
        <div className="h-3 w-16 rounded bg-surface-container-high" />
      </div>
      <div className="col-span-2">
        <div className="h-3 w-20 rounded bg-surface-container-high" />
      </div>
      <div className="col-span-1" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Members page
// ---------------------------------------------------------------------------

const TABS: { key: ActiveTab; label: string }[] = [
  { key: 'all',       label: 'All'                    },
  { key: 'validated', label: 'Validated'              },
  { key: 'pending',   label: 'Pending Affiliation'    },
];

const Members: React.FC = () => {
  const [activeTab, setActiveTab]       = useState<ActiveTab>('all');
  const [showInvite, setShowInvite]     = useState(false);
  const [inviteEmail, setInviteEmail]   = useState('');
  const [inviteRole, setInviteRole]     = useState<'member' | 'admin'>('member');
  const { addToast } = useToast();
  const queryClient = useQueryClient();

  // -------------------------------------------------------------------------
  // Data fetching
  // -------------------------------------------------------------------------

  const { data: rows = [], isLoading } = useQuery<MemberRow[]>({
    queryKey: ['members'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('account_tenants')
        .select(`
          account_id,
          role,
          status,
          joined_at,
          accounts (
            name,
            email,
            phone,
            avatar_url
          )
        `)
        .not('status', 'in', '("archived","deleted")')
        .order('joined_at', { ascending: false });

      if (error) throw error;
      return (data ?? []) as unknown as MemberRow[];
    },
  });

  // -------------------------------------------------------------------------
  // Affiliate mutation
  // -------------------------------------------------------------------------

  const { mutate: affiliate, isPending: isAffiliating } = useMutation({
    mutationFn: async (accountId: string) => {
      const { error } = await supabase.rpc('affiliate_member', {
        target_account_id: accountId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members'] });
    },
  });

  // -------------------------------------------------------------------------
  // Invite mutation
  // -------------------------------------------------------------------------

  const { mutate: sendInvite, isPending: isSending } = useMutation({
    mutationFn: async ({ email, role }: { email: string; role: 'member' | 'admin' }) => {
      const { data: { session } } = await supabase.auth.getSession();
      const { error } = await supabase.functions.invoke('invite-member', {
        body: { email, role },
        headers: session ? { Authorization: `Bearer ${session.access_token}` } : undefined,
      });
      if (error) {
        let msg = error.message;
        try {
          const body = await (error as any).context?.json?.();
          if (body?.error) msg = body.error;
        } catch {}
        throw new Error(msg);
      }
    },
    onSuccess: (_, { email, role }) => {
      addToast(`Invitation sent to ${email} as ${role}`, 'success');
      setInviteEmail('');
      setInviteRole('member');
      setShowInvite(false);
      queryClient.invalidateQueries({ queryKey: ['members'] });
    },
    onError: (e: any) => {
      addToast(`Failed to send invite: ${e.message}`, 'error');
    },
  });

  const handleInviteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    sendInvite({ email: inviteEmail.trim(), role: inviteRole });
  };

  // -------------------------------------------------------------------------
  // Derived lists
  // -------------------------------------------------------------------------

  const validated = rows.filter((r) => r.status === 'affiliated');
  const pending   = rows.filter((r) => r.status === 'initiated');

  const visibleRows =
    activeTab === 'validated' ? validated :
    activeTab === 'pending'   ? pending   :
    rows;

  // -------------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------------

  const handleTabClick = (key: ActiveTab) =>
    setActiveTab(activeTab === key && key !== 'all' ? 'all' : key);

  const statusConfig = (status: AccountStatus) =>
    status === 'affiliated'
      ? { dot: 'bg-tertiary rounded-full', label: 'Validated' }
      : { dot: 'bg-error rounded-none',   label: 'Pending'   };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="space-y-12">

      <PageHeader
        label="Central Command"
        title="Member Directory"
        italicTitle={false}
        description="Manage the collective strength of Vechelon. Control access levels, validate new entrants, and maintain the integrity of the rider network."
      >
        <button
          onClick={() => setShowInvite((v) => !v)}
          className="signature-gradient text-on-primary px-5 py-2.5 rounded-xl font-label text-xs font-bold uppercase tracking-widest flex items-center gap-2 hover:opacity-90 transition-all active:scale-[0.98]"
        >
          <span className="material-symbols-outlined text-base">person_add</span>
          Invite Member
        </button>
      </PageHeader>

      {/* Invite panel */}
      {showInvite && (
        <form
          onSubmit={handleInviteSubmit}
          className="bg-surface-container-low rounded-xl p-6 flex items-end gap-4 border border-outline-variant/20"
        >
          <div className="flex-1 space-y-3">
            <div>
              <label className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant block mb-2">
                Rider Email Address
              </label>
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="rider@example.com"
                required
                autoFocus
                className="w-full bg-surface-container-highest text-on-background font-body text-sm px-4 py-3 rounded-lg border border-outline-variant/30 focus:outline-none focus:border-primary/60 placeholder:text-on-surface-variant/40"
              />
            </div>
            <div>
              <label className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant block mb-2">
                Role
              </label>
              <div className="flex gap-2">
                {(['member', 'admin'] as const).map(r => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setInviteRole(r)}
                    className={`px-4 py-2 rounded-lg font-label text-[10px] uppercase tracking-widest transition-colors ${
                      inviteRole === r
                        ? 'bg-on-background text-background'
                        : 'border border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-high'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
              <p className="font-label text-[10px] text-on-surface-variant/60 mt-2">
                {inviteRole === 'admin'
                  ? 'Admin can manage rides, members, and club settings.'
                  : 'Member can view rides and RSVP. Their account is created as Validated.'}
              </p>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={() => { setShowInvite(false); setInviteEmail(''); }}
              className="px-4 py-3 rounded-lg border border-outline-variant/30 font-label text-xs text-on-surface-variant hover:bg-surface-container-high transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSending || !inviteEmail.trim()}
              className="signature-gradient text-on-primary px-5 py-3 rounded-lg font-label text-xs font-bold uppercase tracking-widest hover:opacity-90 transition-all active:scale-[0.98] disabled:opacity-50"
            >
              {isSending ? 'Sending…' : 'Send Invite'}
            </button>
          </div>
        </form>
      )}

      {/* Tab Navigation */}
      <div className="flex flex-wrap gap-8 border-b border-outline-variant/15">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => handleTabClick(key)}
            className={`pb-4 border-b-2 font-headline font-medium text-sm tracking-tight transition-all ${
              activeTab === key
                ? 'border-primary text-on-background font-bold'
                : 'border-transparent text-on-surface-variant hover:text-on-background'
            }`}
          >
            {label}
            {key === 'all' && !isLoading && (
              <span className="ml-2 font-label text-[10px] bg-surface-container-high text-on-surface-variant px-2 py-0.5 rounded-full">
                {rows.length}
              </span>
            )}
            {key === 'pending' && pending.length > 0 && (
              <span className="ml-2 font-label text-[10px] bg-error-container text-on-error-container px-2 py-0.5 rounded-full">
                {pending.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Member Table */}
      <div className="bg-surface-container-low rounded-xl overflow-hidden">

        {/* Table header */}
        <div className="grid grid-cols-12 gap-4 px-8 py-4 bg-surface-container-high/50 font-label text-[10px] uppercase tracking-widest text-outline">
          <div className="col-span-4">Member Identity</div>
          <div className="col-span-3">Contact</div>
          <div className="col-span-2">Tier</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-1 text-right">Action</div>
        </div>

        {/* Skeleton */}
        {isLoading && Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)}

        {/* Empty state */}
        {!isLoading && visibleRows.length === 0 && (
          <p className="font-label text-sm text-on-surface-variant text-center py-12">
            {activeTab === 'pending'
              ? '— No pending applications —'
              : '— No members to display —'}
          </p>
        )}

        {/* Rows */}
        {!isLoading && visibleRows.map((m) => {
          const sc = statusConfig(m.status);
          return (
            <div
              key={m.account_id}
              className="grid grid-cols-12 gap-4 px-8 py-6 items-center hover:bg-surface-container-highest transition-colors"
            >
              <div className="col-span-4 flex items-center gap-4">
                <Avatar name={m.accounts?.name ?? m.accounts?.email ?? null} avatarUrl={m.accounts?.avatar_url ?? null} />
                <div>
                  <h5 className="font-headline font-bold text-sm text-on-background">
                    {m.accounts?.name ?? m.accounts?.email ?? '—'}
                  </h5>
                  <span className="font-label text-[10px] text-on-surface-variant uppercase tracking-widest">
                    {m.accounts?.email}
                  </span>
                </div>
              </div>
              <div className="col-span-3">
                <p className="font-label text-xs text-on-surface-variant tracking-wider">
                  {m.accounts?.phone ?? '—'}
                </p>
              </div>
              <div className="col-span-2">
                <span className="font-label text-[10px] text-on-surface-variant uppercase tracking-widest">
                  {tierLabel(m.role)}
                </span>
              </div>
              <div className="col-span-2">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 shrink-0 ${sc.dot}`} />
                  <span className="font-headline text-xs font-medium text-on-background">
                    {sc.label}
                  </span>
                </div>
              </div>
              <div className="col-span-1 flex justify-end gap-2">
                {m.status === 'initiated' && (
                  <button
                    onClick={() => affiliate(m.account_id)}
                    disabled={isAffiliating}
                    className="signature-gradient text-on-primary px-4 py-2 rounded-md font-label text-xs font-medium hover:opacity-90 transition-all active:scale-95 disabled:opacity-50"
                  >
                    Affiliate
                  </button>
                )}
                <button className="p-2 rounded-md hover:bg-surface-container-high transition-colors">
                  <span className="material-symbols-outlined text-on-surface-variant text-base">
                    more_horiz
                  </span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
};

export default Members;
