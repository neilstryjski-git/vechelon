import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import PageHeader from '../components/PageHeader';
import { useToast } from '../store/useToast';
import { useAppStore } from '../store/useAppStore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AccountRole   = 'admin' | 'member' | 'guest';
type AccountStatus = 'initiated' | 'affiliated' | 'suspended' | 'archived' | 'deleted';
// 'rsvpd' is a synthetic display status for guest RSVPs — not present in account_tenants.
type DisplayStatus = AccountStatus | 'rsvpd';
type ActiveTab     = 'all' | 'validated' | 'pending' | 'suspended' | 'archived' | 'rsvpd';

type ConfirmActionType = 'suspend' | 'unsuspend' | 'archive' | 'reactivate';

interface MemberRow {
  account_id: string;
  role:       AccountRole;
  status:     DisplayStatus;
  joined_at:  string;
  accounts: {
    name:       string | null;
    email:      string;
    phone:      string | null;
    avatar_url: string | null;
    emergency_contact_name: string | null;
    emergency_contact_phone: string | null;
  };
}

// ---------------------------------------------------------------------------
// Bulk CSV import — parsing + validation (W216)
// ---------------------------------------------------------------------------

const IMPORT_MAX_ROWS = 99;
const IMPORT_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const IMPORT_TEMPLATE =
  'name,email,phone,role,emergency_contact_name,emergency_contact_phone\n' +
  'Jane Rider,jane.rider@example.com,+1-416-555-0100,member,John Rider,+1-416-555-0101\n' +
  'Sam Captain,sam.captain@example.com,+1-416-555-0102,admin,,\n';

interface ParsedMember {
  name: string;
  email: string;
  phone: string;
  role: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
}
interface ParsedRow {
  line: number;           // 1-based data-row number
  member: ParsedMember;
  willAffiliate: boolean; // name && phone present -> affiliated on import
  error?: string;         // set when the row is invalid (excluded from submit)
}
interface ParseResult {
  rows: ParsedRow[];
  fileError?: string;     // fatal: empty / missing email header / over the cap
}
interface ImportRowReport {
  row: number;
  email: string;
  result: string;
  reason?: string;
}
interface ImportReport {
  total: number;
  summary: Record<string, number>;
  reports: ImportRowReport[];
}

// Minimal quoted-field CSV splitter (no external dependency — mirrors the
// no-lib posture used for GPX parsing elsewhere in admin/).
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '', inQ = false;
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; continue; }
    if (ch === ',' && !inQ) { out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function parseMembersCsv(text: string): ParseResult {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { rows: [], fileError: 'The file is empty.' };

  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const col = (name: string) => header.indexOf(name);
  if (col('email') === -1) {
    return { rows: [], fileError: 'CSV must include an "email" column header.' };
  }
  const dataLines = lines.slice(1);
  if (dataLines.length > IMPORT_MAX_ROWS) {
    return { rows: [], fileError: `Too many rows: ${dataLines.length}. The import is capped at ${IMPORT_MAX_ROWS} per file.` };
  }

  const seen = new Set<string>();
  const rows: ParsedRow[] = dataLines.map((line, i) => {
    const cells = splitCsvLine(line);
    const get = (name: string) => { const c = col(name); return c >= 0 ? (cells[c] ?? '') : ''; };
    const member: ParsedMember = {
      name: get('name'),
      email: get('email').toLowerCase(),
      phone: get('phone'),
      role: get('role'),
      emergency_contact_name: get('emergency_contact_name'),
      emergency_contact_phone: get('emergency_contact_phone'),
    };
    const willAffiliate = !!member.name && !!member.phone;
    let error: string | undefined;
    if (!member.email || !IMPORT_EMAIL_RE.test(member.email)) error = 'Missing or invalid email';
    else if (seen.has(member.email)) error = 'Duplicate email in file';
    else seen.add(member.email);
    return { line: i + 1, member, willAffiliate, error };
  });
  return { rows };
}

function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
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

const statusConfig = (status: DisplayStatus) => {
  if (status === 'affiliated') return { dot: 'bg-tertiary rounded-full',        label: 'Approved'   };
  if (status === 'suspended')  return { dot: 'bg-amber-500 rounded-full',       label: 'Paused'     };
  if (status === 'archived')   return { dot: 'bg-outline-variant rounded-none', label: 'Archived'   };
  if (status === 'rsvpd')      return { dot: 'bg-primary rounded-full',         label: "RSVP'd"     };
  return                              { dot: 'bg-error rounded-none',           label: 'Awaiting'   };
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
  onEditContact: () => void;
}

function ActionMenu({ member, isSelf, onSuspend, onUnsuspend, onArchive, onReactivate, onChangeEmail, onEditContact }: ActionMenuProps) {
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
  items.push(item('Edit Details', 'edit', onEditContact));
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
    body:   'This member will be moved to Awaiting status. An admin will need to approve them before they regain access.',
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

interface EditContactModalProps {
  member:    MemberRow;
  isPending: boolean;
  onSubmit:  (fields: { name: string; phone: string; emergencyName: string; emergencyPhone: string }) => void;
  onCancel:  () => void;
}

function EditContactModal({ member, isPending, onSubmit, onCancel }: EditContactModalProps) {
  const [name, setName]                   = useState(member.accounts?.name ?? '');
  const [phone, setPhone]                 = useState(member.accounts?.phone ?? '');
  const [emergencyName, setEmergencyName] = useState(member.accounts?.emergency_contact_name ?? '');
  const [emergencyPhone, setEmergencyPhone] = useState(member.accounts?.emergency_contact_phone ?? '');

  const heading = member.accounts?.name ?? member.accounts?.email ?? 'this member';
  // A guest RSVP ('rsvpd') has no account yet — saving provisions one and (with
  // name+phone) adds them as an affiliated member. A real 'initiated' member is
  // promoted the same way. Admin completing details = the approval gesture.
  const isGuest = member.status === 'rsvpd';
  const willPromote = (member.status === 'initiated' || isGuest) && !!name.trim() && !!phone.trim();

  const field = (
    label: string, value: string, set: (v: string) => void,
    type = 'text', placeholder = '', autoFocus = false,
  ) => (
    <div>
      <label className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant block mb-2">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => set(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="w-full bg-surface-container-highest text-on-background font-body text-sm px-4 py-3 rounded-lg border border-outline-variant/30 focus:outline-none focus:border-primary/60 placeholder:text-on-surface-variant/40"
      />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-surface-container-lowest rounded-2xl shadow-xl border border-surface-container-low p-8 max-w-md w-full mx-4 space-y-6 max-h-[90vh] overflow-y-auto">
        <div className="space-y-2">
          <h3 className="font-headline font-bold text-lg text-on-background">{isGuest ? 'Complete Account' : 'Edit Contact Details'}</h3>
          <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant">{heading}</p>
          {isGuest && (
            <p className="font-body text-xs text-on-surface-variant/70">
              Completing the account for <span className="font-semibold">{member.accounts?.email}</span> from their guest RSVP.
            </p>
          )}
        </div>

        <div className="space-y-4">
          {field('Full Name', name, setName, 'text', 'Jane Rider', true)}
          {field('Phone', phone, setPhone, 'tel', '+1 555 000 0000')}
          <div className="pt-2 border-t border-outline-variant/15" />
          <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant/60">Emergency Contact (optional)</p>
          {field('Emergency Contact Name', emergencyName, setEmergencyName, 'text', 'Contact name')}
          {field('Emergency Contact Phone', emergencyPhone, setEmergencyPhone, 'tel', '+1 555 000 0000')}
        </div>

        {(member.status === 'initiated' || isGuest) && (
          <p className={`font-label text-xs ${willPromote ? 'text-tertiary' : 'text-on-surface-variant/70'}`}>
            {isGuest
              ? (willPromote
                  ? 'Saving will complete this rider’s account and approve them (name + phone complete).'
                  : 'Add a name and phone to approve this rider (otherwise the account is created as Awaiting).')
              : (willPromote
                  ? 'Saving will approve this member (name + phone complete).'
                  : 'Add a name and phone to approve this member.')}
          </p>
        )}

        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-5 py-2.5 rounded-lg border border-outline-variant/30 font-label text-xs text-on-surface-variant hover:bg-surface-container-high transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onSubmit({ name, phone, emergencyName, emergencyPhone })}
            disabled={isPending}
            className="signature-gradient text-on-primary px-5 py-2.5 rounded-lg font-label text-xs font-bold uppercase tracking-widest hover:opacity-90 transition-all active:scale-[0.98] disabled:opacity-50"
          >
            {isPending ? 'Saving…' : isGuest ? 'Complete Account' : 'Save Details'}
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
  { key: 'validated', label: 'Approved'  },
  { key: 'pending',   label: 'Awaiting'  },
  { key: 'rsvpd',     label: "RSVP'd"    },
  { key: 'suspended', label: 'Paused'    },
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
  const [showImport, setShowImport]   = useState(false);
  const [importParse, setImportParse] = useState<ParseResult | null>(null);
  const [importReport, setImportReport] = useState<ImportReport | null>(null);
  const [importDryRun, setImportDryRun] = useState<ImportReport | null>(null);
  const importFileRef = useRef<HTMLInputElement>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [confirmAction, setConfirmAction] = useState<{
    type:   ConfirmActionType;
    member: MemberRow;
  } | null>(null);
  const [changeEmailTarget, setChangeEmailTarget] = useState<MemberRow | null>(null);
  const [editContactTarget, setEditContactTarget] = useState<MemberRow | null>(null);

  const { addToast }  = useToast();
  const queryClient   = useQueryClient();
  const currentTenantId = useAppStore((s) => s.currentTenantId);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
  }, []);

  // -------------------------------------------------------------------------
  // Data fetching
  // -------------------------------------------------------------------------

  const { data: rows = [], isLoading } = useQuery<MemberRow[]>({
    queryKey: ['members', currentTenantId],
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
        .eq('tenant_id', currentTenantId!)
        .not('status', 'in', '("deleted")')
        .order('joined_at', { ascending: false });

      if (error) throw error;
      return (data ?? []) as unknown as MemberRow[];
    },
    enabled: !!currentTenantId,
  });

  // Guest RSVPs — rows with no linked account (account_id IS NULL).
  // After D37, members also store their email on ride_participants, so the
  // account_id NULL filter is the load-bearing semantic — NOT email presence.
  // Deduped by email, keeping the most recent RSVP. Tenant-scoped via rides join.
  const { data: rsvpd = [], isLoading: isLoadingRsvpd } = useQuery<MemberRow[]>({
    queryKey: ['members', 'rsvpd', currentTenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ride_participants')
        .select('id, display_name, email, joined_at, rides!inner(tenant_id)')
        .eq('rides.tenant_id', currentTenantId!)
        .is('account_id', null)
        .not('email', 'is', null)
        .order('joined_at', { ascending: false });

      if (error) throw error;

      const seen = new Set<string>();
      const unique: MemberRow[] = [];
      for (const p of (data ?? []) as Array<{ id: string; display_name: string | null; email: string; joined_at: string }>) {
        const key = p.email.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push({
          account_id: p.id,
          role:       'guest',
          status:     'rsvpd',
          joined_at:  p.joined_at,
          accounts: {
            name:       p.display_name,
            email:      p.email,
            phone:      null,
            avatar_url: null,
            emergency_contact_name:  null,
            emergency_contact_phone: null,
          },
        });
      }
      return unique;
    },
    enabled: !!currentTenantId,
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
      if (error) {
        let msg = error.message;
        try {
          const body = await (error as any).context?.json();
          if (body?.error) msg = body.error;
          else if (body?.message) msg = body.message;
        } catch (e) {
          console.warn('[Members] Failed to parse error body:', e);
        }
        throw new Error(msg);
      }
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
  // Edit contact details mutation (admin-gated RPC; may auto-promote to affiliated)
  // -------------------------------------------------------------------------

  const { mutate: saveContact, isPending: isSavingContact } = useMutation({
    mutationFn: async (
      { accountId, isGuest, fields }: {
        accountId: string;   // for guests this is the ride_participants.id (synthetic)
        isGuest:   boolean;
        fields: { name: string; phone: string; emergencyName: string; emergencyPhone: string };
      },
    ): Promise<string | null> => {
      if (isGuest) {
        // Guest RSVP -> provision + link an account via the admin EF (auth admin
        // API can't live in a SQL RPC). accountId is the ride_participants.id.
        const { data: { session } } = await supabase.auth.getSession();
        const { data, error } = await supabase.functions.invoke('admin-complete-guest', {
          body: {
            ride_participant_id:      accountId,
            name:                     fields.name,
            phone:                    fields.phone,
            emergency_contact_name:   fields.emergencyName,
            emergency_contact_phone:  fields.emergencyPhone,
          },
          headers: session ? { Authorization: `Bearer ${session.access_token}` } : undefined,
        });
        if (error) {
          let msg = error.message;
          try {
            const body = await (error as { context?: Response }).context?.json?.();
            if (body?.error) msg = body.error;
          } catch { /* ignore */ }
          throw new Error(msg);
        }
        if (data?.error) throw new Error(data.error);
        return (data?.status as string | null) ?? null;
      }

      const { data, error } = await supabase.rpc('admin_update_member_contact', {
        target_account_id:         accountId,
        p_name:                    fields.name,
        p_phone:                   fields.phone,
        p_emergency_contact_name:  fields.emergencyName,
        p_emergency_contact_phone: fields.emergencyPhone,
      });
      if (error) throw error;
      return (data as string | null) ?? null;
    },
    onSuccess: (newStatus) => {
      const wasGuest     = editContactTarget?.status === 'rsvpd';
      const wasInitiated = editContactTarget?.status === 'initiated';
      addToast(
        wasGuest
          ? (newStatus === 'affiliated' ? 'Account completed — member approved.' : 'Account completed (Awaiting — add phone to approve).')
          : (wasInitiated && newStatus === 'affiliated' ? 'Details saved — member approved.' : 'Contact details saved.'),
        'success',
      );
      setEditContactTarget(null);
      // Member list reads account_tenants.status; tier detection reads it too.
      queryClient.invalidateQueries({ queryKey: ['members'] });
      queryClient.invalidateQueries({ queryKey: ['user-tier'] });
    },
    onError: (e: Error) => {
      addToast(`Failed to save details: ${e.message}`, 'error');
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
        } catch (e) {
          console.warn('[Members] Failed to parse error body:', e);
        }
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
  // Bulk CSV import mutation (W216)
  // -------------------------------------------------------------------------

  const { mutate: runImport, isPending: isImporting } = useMutation({
    mutationFn: async (members: ParsedMember[]) => {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke('bulk-create-members', {
        body: { members },
        headers: session ? { Authorization: `Bearer ${session.access_token}` } : undefined,
      });
      if (error) {
        let msg = error.message;
        try {
          const body = await (error as any).context?.json?.();
          if (body?.error) msg = body.error;
        } catch (e) {
          console.warn('[Members] Failed to parse import error body:', e);
        }
        throw new Error(msg);
      }
      return data as ImportReport;
    },
    onSuccess: (data) => {
      setImportReport(data);
      setShowImport(false);
      setImportParse(null);
      setImportDryRun(null);
      if (importFileRef.current) importFileRef.current.value = '';
      queryClient.invalidateQueries({ queryKey: ['members'] });
    },
    onError: (e: Error) => {
      addToast(`Import failed: ${e.message}`, 'error');
    },
  });

  // Dry-run: DB-aware preview (already-member / cross-club) before committing.
  const { mutate: runDryRun, isPending: isDryRunning } = useMutation({
    mutationFn: async (members: ParsedMember[]) => {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke('bulk-create-members', {
        body: { members, dryRun: true },
        headers: session ? { Authorization: `Bearer ${session.access_token}` } : undefined,
      });
      if (error) throw new Error(error.message);
      return data as ImportReport;
    },
    onSuccess: (data) => setImportDryRun(data),
    onError: () => setImportDryRun(null), // preview gracefully falls back to client-only
  });

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    setImportDryRun(null);
    if (!f) { setImportParse(null); return; }
    try {
      const text = await f.text();
      const parsed = parseMembersCsv(text);
      setImportParse(parsed);
      if (!parsed.fileError) {
        const valid = parsed.rows.filter((r) => !r.error).map((r) => r.member);
        if (valid.length > 0) runDryRun(valid);
      }
    } catch {
      setImportParse({ rows: [], fileError: 'Could not read the file.' });
    }
  };

  const submitImport = () => {
    if (!importParse || importParse.fileError) return;
    const valid = importParse.rows.filter((r) => !r.error).map((r) => r.member);
    if (valid.length === 0) { addToast('No valid rows to import.', 'error'); return; }
    runImport(valid);
  };

  const closeImport = () => {
    setShowImport(false);
    setImportParse(null);
    setImportDryRun(null);
    if (importFileRef.current) importFileRef.current.value = '';
  };

  const downloadErrorRows = () => {
    if (!importReport) return;
    const failed = importReport.reports.filter(
      (r) => r.result === 'failed' || r.result.startsWith('skipped'),
    );
    const body = failed.map((r) => `${r.row},${r.email},${r.result},"${(r.reason ?? '').replace(/"/g, '""')}"`).join('\n');
    downloadCsv('bulk-import-issues.csv', `row,email,result,reason\n${body}\n`);
  };

  // -------------------------------------------------------------------------
  // Confirm action handler
  // -------------------------------------------------------------------------

  const copyEmail = async (email: string | undefined) => {
    if (!email) return;
    try {
      await navigator.clipboard.writeText(email);
      addToast('Email copied', 'success');
    } catch {
      addToast('Could not access clipboard', 'error');
    }
  };

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

  const allRows = [...rows, ...rsvpd].sort((a, b) =>
    a.joined_at < b.joined_at ? 1 : a.joined_at > b.joined_at ? -1 : 0
  );

  const visibleRows =
    activeTab === 'validated' ? validated :
    activeTab === 'pending'   ? pending   :
    activeTab === 'suspended' ? suspended :
    activeTab === 'archived'  ? archived  :
    activeTab === 'rsvpd'     ? rsvpd     :
    allRows;

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

      {editContactTarget && (
        <EditContactModal
          member={editContactTarget}
          isPending={isSavingContact}
          onSubmit={(fields) => saveContact({ accountId: editContactTarget.account_id, isGuest: editContactTarget.status === 'rsvpd', fields })}
          onCancel={() => setEditContactTarget(null)}
        />
      )}

      {/* Bulk import result report */}
      {importReport && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setImportReport(null)}
        >
          <div
            className="bg-surface-container-lowest rounded-2xl shadow-xl border border-surface-container-low p-8 max-w-lg w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-headline text-lg font-bold text-on-background">Import complete</h3>
            <p className="font-label text-xs text-on-surface-variant/70 mt-1">{importReport.total} rows processed.</p>
            <div className="flex flex-wrap gap-x-5 gap-y-1 mt-4 font-label text-[11px] text-on-surface-variant">
              {Object.entries(importReport.summary).map(([k, v]) => (
                <span key={k}><strong className="text-on-background">{v}</strong> {k.replace(/-/g, ' ')}</span>
              ))}
            </div>
            <div className="mt-4 max-h-64 overflow-y-auto rounded-lg border border-outline-variant/20 divide-y divide-outline-variant/10">
              {importReport.reports.map((r) => (
                <div key={r.row} className="flex items-center justify-between gap-3 px-3 py-1.5 font-label text-[11px]">
                  <span className="text-on-surface-variant truncate">{r.email || `Row ${r.row}`}</span>
                  <span
                    className={`shrink-0 ${
                      r.result === 'failed'
                        ? 'text-error'
                        : r.result.startsWith('created')
                          ? 'text-on-background'
                          : 'text-on-surface-variant/60'
                    }`}
                  >
                    {r.result.replace(/-/g, ' ')}{r.reason ? ` — ${r.reason}` : ''}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 mt-6">
              {importReport.reports.some((r) => r.result === 'failed' || r.result.startsWith('skipped')) && (
                <button
                  onClick={downloadErrorRows}
                  className="px-5 py-2.5 rounded-lg border border-outline-variant/30 font-label text-xs text-on-surface-variant hover:bg-surface-container-high transition-colors"
                >
                  Download issues
                </button>
              )}
              <button
                onClick={() => setImportReport(null)}
                className="signature-gradient text-on-primary px-5 py-2.5 rounded-lg font-label text-xs font-bold uppercase tracking-widest hover:opacity-90 transition-all active:scale-[0.98]"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      <PageHeader
        label="Central Command"
        title="Member Directory"
        italicTitle={false}
        description="Manage the collective strength of Vechelon. Control access levels, validate new entrants, and maintain the integrity of the rider network."
      >
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setShowImport((v) => !v); setShowInvite(false); }}
            className="px-5 py-2.5 rounded-xl border border-outline-variant/30 font-label text-xs font-bold uppercase tracking-widest text-on-surface-variant flex items-center gap-2 hover:bg-surface-container-high transition-colors active:scale-[0.98]"
          >
            <span className="material-symbols-outlined text-base">upload_file</span>
            Import CSV
          </button>
          <button
            onClick={() => { setShowInvite((v) => !v); setShowImport(false); }}
            className="signature-gradient text-on-primary px-5 py-2.5 rounded-xl font-label text-xs font-bold uppercase tracking-widest flex items-center gap-2 hover:opacity-90 transition-all active:scale-[0.98]"
          >
            <span className="material-symbols-outlined text-base">person_add</span>
            Invite Member
          </button>
        </div>
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
                  : 'Member can view rides and RSVP. Their account is created as Approved.'}
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

      {/* Import CSV panel */}
      {showImport && (
        <div className="bg-surface-container-low rounded-xl p-6 border border-outline-variant/20 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-headline text-sm font-bold text-on-background">Import a roster from CSV</p>
              <p className="font-label text-[11px] text-on-surface-variant/70 mt-1 leading-relaxed">
                Up to {IMPORT_MAX_ROWS} known members. Columns: name, email, phone, role, emergency_contact_name, emergency_contact_phone.
                Rows with name + phone are added as Validated; the rest as Pending. An invite email is sent to each member.
              </p>
            </div>
            <button
              type="button"
              onClick={() => downloadCsv('bulk-member-import-template.csv', IMPORT_TEMPLATE)}
              className="shrink-0 px-4 py-2 rounded-lg border border-outline-variant/30 font-label text-[10px] uppercase tracking-widest text-on-surface-variant hover:bg-surface-container-high transition-colors"
            >
              Download template
            </button>
          </div>

          <input
            ref={importFileRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleImportFile}
            className="w-full font-label text-xs text-on-surface-variant file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:font-label file:text-xs file:bg-surface-container-high file:text-on-surface-variant hover:file:bg-surface-container-highest cursor-pointer"
          />

          {importParse?.fileError && (
            <p className="font-label text-xs text-error">{importParse.fileError}</p>
          )}

          {importParse && !importParse.fileError && (() => {
            const clientFlagged = importParse.rows.filter((r) => r.error);
            const validRows = importParse.rows.filter((r) => !r.error);
            const byEmail = new Map(importDryRun?.reports.map((r) => [r.email, r]) ?? []);

            let toValidate = 0, toPending = 0, alreadyMember = 0, crossClub = 0;
            const dbFlagged: { line: number; email: string; reason: string }[] = [];
            for (const r of validRows) {
              const rep = importDryRun ? byEmail.get(r.member.email) : undefined;
              if (!importDryRun) { r.willAffiliate ? toValidate++ : toPending++; continue; }
              switch (rep?.result) {
                case 'created-affiliated': toValidate++; break;
                case 'created-initiated': toPending++; break;
                case 'skipped-already-member':
                  alreadyMember++; dbFlagged.push({ line: r.line, email: r.member.email, reason: 'Already a member' }); break;
                case 'failed':
                  crossClub++; dbFlagged.push({ line: r.line, email: r.member.email, reason: rep?.reason || 'Rejected' }); break;
                default: r.willAffiliate ? toValidate++ : toPending++;
              }
            }
            return (
              <div className="space-y-3">
                {isDryRunning && (
                  <p className="font-label text-[11px] text-on-surface-variant/60">Checking against existing members…</p>
                )}
                <div className="flex flex-wrap gap-x-6 gap-y-1 font-label text-[11px] text-on-surface-variant">
                  <span><strong className="text-on-background">{toValidate + toPending}</strong> to import</span>
                  <span><strong className="text-on-background">{toValidate}</strong> → Validated</span>
                  <span><strong className="text-on-background">{toPending}</strong> → Pending (no name/phone)</span>
                  {alreadyMember > 0 && <span><strong className="text-on-background">{alreadyMember}</strong> already members</span>}
                  {crossClub > 0 && <span className="text-error"><strong>{crossClub}</strong> from another club</span>}
                  {clientFlagged.length > 0 && <span className="text-error"><strong>{clientFlagged.length}</strong> invalid</span>}
                </div>
                {(clientFlagged.length > 0 || dbFlagged.length > 0) && (
                  <div className="max-h-32 overflow-y-auto rounded-lg border border-outline-variant/20 divide-y divide-outline-variant/10">
                    {clientFlagged.map((r) => (
                      <div key={`c-${r.line}`} className="flex items-center justify-between px-3 py-1.5 font-label text-[11px]">
                        <span className="text-on-surface-variant truncate">Row {r.line}: {r.member.email || '(no email)'}</span>
                        <span className="text-error shrink-0 ml-3">{r.error}</span>
                      </div>
                    ))}
                    {dbFlagged.map((r) => (
                      <div key={`d-${r.line}`} className="flex items-center justify-between px-3 py-1.5 font-label text-[11px]">
                        <span className="text-on-surface-variant truncate">Row {r.line}: {r.email}</span>
                        <span className="text-on-surface-variant/60 shrink-0 ml-3">{r.reason}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={closeImport}
              className="px-5 py-2.5 rounded-lg border border-outline-variant/30 font-label text-xs text-on-surface-variant hover:bg-surface-container-high transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submitImport}
              disabled={isImporting || isDryRunning || !importParse || !!importParse.fileError || importParse.rows.every((r) => r.error)}
              className="signature-gradient text-on-primary px-5 py-2.5 rounded-lg font-label text-xs font-bold uppercase tracking-widest hover:opacity-90 transition-all active:scale-[0.98] disabled:opacity-50"
            >
              {isImporting ? 'Importing…' : 'Import members'}
            </button>
          </div>
        </div>
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
                {rows.length + rsvpd.length}
              </span>
            )}
            {key === 'pending' && pending.length > 0 && (
              <span className="ml-2 font-label text-[10px] bg-error-container text-on-error-container px-2 py-0.5 rounded-full">
                {pending.length}
              </span>
            )}
            {key === 'rsvpd' && !isLoadingRsvpd && rsvpd.length > 0 && (
              <span className="ml-2 font-label text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                {rsvpd.length}
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
              : activeTab === 'rsvpd'
                ? '— No guest RSVPs —'
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
                  <div className="flex items-center gap-1.5">
                    <span className="font-label text-[10px] text-on-surface-variant uppercase tracking-widest truncate">
                      {m.accounts?.email}
                    </span>
                    {m.accounts?.email && (
                      <button
                        onClick={() => copyEmail(m.accounts?.email)}
                        aria-label={`Copy ${m.accounts.email}`}
                        title="Copy email"
                        className="p-0.5 rounded text-on-surface-variant/50 hover:text-on-background hover:bg-surface-container-high transition-colors"
                      >
                        <span className="material-symbols-outlined text-[14px] leading-none">content_copy</span>
                      </button>
                    )}
                  </div>
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
                {m.status === 'rsvpd' && (
                  <button
                    onClick={() => setEditContactTarget(m)}
                    className="px-4 py-2 rounded-md border border-outline-variant/40 font-label text-xs font-medium text-on-surface-variant hover:text-primary hover:border-primary/50 transition-all active:scale-95"
                  >
                    Complete Account
                  </button>
                )}
                {m.status !== 'rsvpd' && (
                  <ActionMenu
                    member={m}
                    isSelf={isSelf}
                    onSuspend={()    => setConfirmAction({ type: 'suspend',    member: m })}
                    onUnsuspend={()  => setConfirmAction({ type: 'unsuspend',  member: m })}
                    onArchive={()    => setConfirmAction({ type: 'archive',    member: m })}
                    onReactivate={() => setConfirmAction({ type: 'reactivate', member: m })}
                    onChangeEmail={()=> setChangeEmailTarget(m)}
                    onEditContact={()=> setEditContactTarget(m)}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
};

export default Members;
