import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import PageHeader from '../components/PageHeader';
import { useToast } from '../store/useToast';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AccountRole   = 'admin' | 'member' | 'guest';
type AccountStatus = 'initiated' | 'affiliated' | 'suspended' | 'archived' | 'deleted';
type ActiveTab     = 'all' | 'validated' | 'pending' | 'suspended' | 'archived';

type ConfirmActionType = 'suspend' | 'unsuspend' | 'archive' | 'reactivate';

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
    emergency_contact_name: string | null;
    emergency_contact_phone: string | null;
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
//     Then I see all non-deleted accounts for my tenant
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
//   Scenario: Suspending a member
//     Given a member with status "affiliated" exists
//     When I click the action menu → Suspend
//     Then a confirmation dialog appears
//     When I confirm
//     Then account_tenants.status becomes 'suspended'
//     And the member loses portal access immediately via RLS
//
//   Scenario: Admin cannot suspend themselves
//     Given I am viewing my own row
//     Then the Suspend and Archive options are hidden
//
//   Scenario: Archiving a suspended member
//     Given a member with status "suspended" exists
//     When I click action menu → Archive and confirm
//     Then status becomes 'archived'
//
//   Scenario: Reactivating an archived member
//     Given a member with status "archived" exists
//     When I click action menu → Reactivate and confirm
//     Then status becomes 'initiated'
//     And the member appears in Pending tab awaiting re-affiliation
//
//   Scenario: Changing member email
//     Given any member exists
//     When I click action menu → Change Email and submit a new address
//     Then change-member-email edge function is invoked
//     And the member list refreshes
//
//   Scenario: Non-admin cannot affiliate
//     Given I am authenticated as a regular member
//     When I invoke affiliate_member directly
//     Then I receive "Permission denied: only admins can affiliate members"
//
//   Scenario: Admin invites a new member (auto-affiliated)
//     Given I am authenticated as a tenant admin
//     When I click "Invite Member" and enter a valid email
//     Then a branded invite email is sent via the invite-member edge function
//     And the recipient's account is pre-created at 'affiliated' status

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

const statusConfig = (status: AccountStatus) => {
  if (status === 'affiliated') return { dot: 'bg-tertiary rounded-full',        label: 'Validated'  };
  if (status === 'suspended')  return { dot: 'bg-amber-500 rounded-full',       label: 'Suspended'  };
  if (status === 'archived')   return { dot: 'bg-outline-variant rounded-none', label: 'Archived'   };
  return                              { dot: 'bg-error rounded-none',           label: 'Pending'    };
};

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

interface ActionMenuProps {
  member:       MemberRow;
  isSelf:       boolean;
  onSuspend:    () => void;
  onUnsuspend:  () => void;
  onArchive:    () => void;
  onReactivate: () => void;
  onChangeEmail: () => void;
}

function ActionMenu({ member, isSelf, onSuspend, onUnsuspend, onArchive, onReactivate, onChangeEmail }: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const item = (label: string, icon: string, action: () => void, danger = false) => (
    <button
      key={label}
      onMouseDown={(e) => { e.stopPropagation(); action(); setOpen(false); }}
      className={`w-full flex items-center gap-3 px-4 py-2.5 font-label text-xs tracking-wide text-left transition-colors hover:bg-surface-container-high ${
        danger ? 'text-error' : 'text-on-surface-variant'
      }`}
    >
      <span className="material-symbols-outlined text-sm">{icon}</span>
      {label}
    </button>
  );

  const items: React.ReactNode[] = [];

  if (member.status === 'affiliated' && !isSelf) {
    items.push(item('Suspend',  'block',    onSuspend,  true));
    items.push(item('Archive',  'archive',  onArchive,  true));
  }
  if (member.status === 'suspended') {
    items.push(item('Unsuspend', 'check_circle', onUnsuspend));
    if (!isSelf) items.push(item('Archive', 'archive', onArchive, true));
  }
  if (member.status === 'archived') {
    items.push(item('Reactivate', 'refresh', onReactivate));
  }
  if (member.status === 'initiated' && !isSelf) {
    items.push(item('Archive', 'archive', onArchive, true));
  }
  items.push(item('Change Email', 'mail', onChangeEmail));

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="p-2 rounded-md hover:bg-surface-container-high transition-colors"
      >
        <span className="material-symbols-outlined text-on-surface-variant text-base">more_horiz</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-44 bg-surface-container-lowest rounded-xl shadow-lg border border-surface-container-low overflow-hidden">
          {items}
        </div>
      )}
    </div>
  );
}

interface ConfirmModalProps {
  actionType: ConfirmActionType;
  member:     MemberRow;
  isPending:  boolean;
  onConfirm:  () => void;
  onCancel:   () => void;
}

const CONFIRM_COPY: Record<ConfirmActionType, { title: string; body: string; button: string; danger: boolean }> = {
  suspend: {
    title:  'Suspend Member',
    body:   'This member will immediately lose portal access. They can be unsuspended at any time.',
    button: 'Suspend',
    danger: true,
  },
  unsuspend: {
    title:  'Unsuspend Member',
    body:   'This member will regain full portal access as an affiliated member.',
    button: 'Unsuspend',
    danger: false,
  },
  archive: {
    title:  'Archive Member',
    body:   'Archiving removes portal access permanently. The member can be reactivated later, but will need to be re-affiliated.',
    button: 'Archive',
    danger: true,
  },
  reactivate: {
    title:  'Reactivate Member',
    body:   'This member will be moved to Pending status. An admin will need to affiliate them before they regain access.',
    button: 'Reactivate',
    danger: false,
  },
};

function ConfirmModal({ actionType, member, isPending, onConfirm, onCancel }: ConfirmModalProps) {
  const copy = CONFIRM_COPY[actionType];
  const name = member.accounts?.name ?? member.accounts?.email ?? 'this member';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-surface-container-lowest rounded-2xl shadow-xl border border-surface-container-low p-8 max-w-md w-full mx-4 space-y-6">
        <div className="space-y-2">
          <h3 className="font-headline font-bold text-lg text-on-background">{copy.title}</h3>
          <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant">{name}</p>
        </div>
        <p className="font-body text-sm text-on-surface-variant">{copy.body}</p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-5 py-2.5 rounded-lg border border-outline-variant/30 font-label text-xs text-on-surface-variant hover:bg-surface-container-high transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isPending}
            className={`px-5 py-2.5 rounded-lg font-label text-xs font-bold uppercase tracking-widest transition-all active:scale-[0.98] disabled:opacity-50 ${
              copy.danger
                ? 'bg-error text-on-error hover:opacity-90'
                : 'signature-gradient text-on-primary hover:opacity-90'
            }`}
          >
            {isPending ? 'Working…' : copy.button}
          </button>
        </div>
      </div>
    </div>
  );
}

interface ChangeEmailModalProps {
  member:    MemberRow;
  isPending: boolean;
  onSubmit:  (email: string) => void;
  onCancel:  () => void;
}

function ChangeEmailModal({ member, isPending, onSubmit, onCancel }: ChangeEmailModalProps) {
  const [email, setEmail] = useState('');
  const name = member.accounts?.name ?? member.accounts?.email ?? 'this member';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-surface-container-lowest rounded-2xl shadow-xl border border-surface-container-low p-8 max-w-md w-full mx-4 space-y-6">
        <div className="space-y-2">
          <h3 className="font-headline font-bold text-lg text-on-background">Change Email</h3>
          <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant">{name}</p>
          <p className="font-label text-xs text-on-surface-variant">Current: {member.accounts?.email}</p>
        </div>
        <div>
          <label className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant block mb-2">
            New Email Address
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="new@example.com"
            autoFocus
            className="w-full bg-surface-container-highest text-on-background font-body text-sm px-4 py-3 rounded-lg border border-outline-variant/30 focus:outline-none focus:border-primary/60 placeholder:text-on-surface-variant/40"
          />
        </div>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-5 py-2.5 rounded-lg border border-outline-variant/30 font-label text-xs text-on-surface-variant hover:bg-surface-container-high transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onSubmit(email.trim())}
            disabled={isPending || !email.trim()}
            className="signature-gradient text-on-primary px-5 py-2.5 rounded-lg font-label text-xs font-bold uppercase tracking-widest hover:opacity-90 transition-all active:scale-[0.98] disabled:opacity-50"
          >
            {isPending ? 'Saving…' : 'Update Email'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab config
// ---------------------------------------------------------------------------

const TABS: { key: ActiveTab; label: string }[] = [
  { key: 'all',       label: 'All'       },
  { key: 'validated', label: 'Validated' },
  { key: 'pending',   label: 'Pending'   },
  { key: 'suspended', label: 'Suspended' },
  { key: 'archived',  label: 'Archived'  },
];

// ---------------------------------------------------------------------------
// Members page
// ---------------------------------------------------------------------------

const Members: React.FC = () => {
  const [activeTab, setActiveTab]     = useState<ActiveTab>('all');
  const [showInvite, setShowInvite]   = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole]   = useState<'member' | 'admin'>('member');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [confirmAction, setConfirmAction] = useState<{
    type:   ConfirmActionType;
    member: MemberRow;
  } | null>(null);
  const [changeEmailTarget, setChangeEmailTarget] = useState<MemberRow | null>(null);

  const { addToast }  = useToast();
  const queryClient   = useQueryClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
  }, []);

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
            avatar_url,
            emergency_contact_name,
            emergency_contact_phone
          )
        `)
        .not('status', 'in', '("deleted")')
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
  // Status mutations (suspend / unsuspend / archive / reactivate)
  // -------------------------------------------------------------------------

  const { mutate: setMemberStatus, isPending: isChangingStatus } = useMutation({
    mutationFn: async ({ accountId, status }: { accountId: string; status: AccountStatus }) => {
      const { error } = await supabase
        .from('account_tenants')
        .update({ status })
        .eq('account_id', accountId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members'] });
      setConfirmAction(null);
    },
    onError: (e: Error) => {
      addToast(`Action failed: ${e.message}`, 'error');
    },
  });

  // -------------------------------------------------------------------------
  // Change email mutation
  // -------------------------------------------------------------------------

  const { mutate: changeEmail, isPending: isChangingEmail } = useMutation({
    mutationFn: async ({ accountId, email }: { accountId: string; email: string }) => {
      const { data: { session } } = await supabase.auth.getSession();
      const { error } = await supabase.functions.invoke('change-member-email', {
        body: { account_id: accountId, email },
        headers: session ? { Authorization: `Bearer ${session.access_token}` } : undefined,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: (_, { email }) => {
      addToast(`Email updated to ${email}`, 'success');
      setChangeEmailTarget(null);
      queryClient.invalidateQueries({ queryKey: ['members'] });
    },
    onError: (e: Error) => {
      addToast(`Failed to change email: ${e.message}`, 'error');
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
  // Confirm action handler
  // -------------------------------------------------------------------------

  const handleConfirm = () => {
    if (!confirmAction) return;
    const { type, member } = confirmAction;
    const statusMap: Record<ConfirmActionType, AccountStatus> = {
      suspend:    'suspended',
      unsuspend:  'affiliated',
      archive:    'archived',
      reactivate: 'initiated',
    };
    setMemberStatus({ accountId: member.account_id, status: statusMap[type] });
  };

  // -------------------------------------------------------------------------
  // Derived lists
  // -------------------------------------------------------------------------

  const validated = rows.filter((r) => r.status === 'affiliated');
  const pending   = rows.filter((r) => r.status === 'initiated');
  const suspended = rows.filter((r) => r.status === 'suspended');
  const archived  = rows.filter((r) => r.status === 'archived');

  const visibleRows =
    activeTab === 'validated' ? validated :
    activeTab === 'pending'   ? pending   :
    activeTab === 'suspended' ? suspended :
    activeTab === 'archived'  ? archived  :
    rows;

  const handleTabClick = (key: ActiveTab) =>
    setActiveTab(activeTab === key && key !== 'all' ? 'all' : key);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="space-y-12">

      {/* Modals */}
      {confirmAction && (
        <ConfirmModal
          actionType={confirmAction.type}
          member={confirmAction.member}
          isPending={isChangingStatus}
          onConfirm={handleConfirm}
          onCancel={() => setConfirmAction(null)}
        />
      )}

      {changeEmailTarget && (
        <ChangeEmailModal
          member={changeEmailTarget}
          isPending={isChangingEmail}
          onSubmit={(email) => changeEmail({ accountId: changeEmailTarget.account_id, email })}
          onCancel={() => setChangeEmailTarget(null)}
        />
      )}

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
            {key === 'suspended' && suspended.length > 0 && (
              <span className="ml-2 font-label text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                {suspended.length}
              </span>
            )}
            {key === 'archived' && archived.length > 0 && (
              <span className="ml-2 font-label text-[10px] bg-surface-container-high text-on-surface-variant px-2 py-0.5 rounded-full">
                {archived.length}
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
          const sc     = statusConfig(m.status);
          const isSelf = m.account_id === currentUserId;
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
                {(m.accounts?.emergency_contact_name || m.accounts?.emergency_contact_phone) && (
                  <div className="mt-1 flex items-center gap-1.5 opacity-50">
                    <span className="material-symbols-outlined text-[10px] text-error">emergency</span>
                    <span className="font-label text-[9px] uppercase tracking-tighter truncate max-w-[120px]">
                      {m.accounts?.emergency_contact_name || 'Contact'} · {m.accounts?.emergency_contact_phone || '—'}
                    </span>
                  </div>
                )}
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
              <div className="col-span-1 flex justify-end items-center gap-2">
                {m.status === 'initiated' && (
                  <button
                    onClick={() => affiliate(m.account_id)}
                    disabled={isAffiliating}
                    className="signature-gradient text-on-primary px-4 py-2 rounded-md font-label text-xs font-medium hover:opacity-90 transition-all active:scale-95 disabled:opacity-50"
                  >
                    Affiliate
                  </button>
                )}
                <ActionMenu
                  member={m}
                  isSelf={isSelf}
                  onSuspend={()    => setConfirmAction({ type: 'suspend',    member: m })}
                  onUnsuspend={()  => setConfirmAction({ type: 'unsuspend',  member: m })}
                  onArchive={()    => setConfirmAction({ type: 'archive',    member: m })}
                  onReactivate={() => setConfirmAction({ type: 'reactivate', member: m })}
                  onChangeEmail={()=> setChangeEmailTarget(m)}
                />
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
};

export default Members;
