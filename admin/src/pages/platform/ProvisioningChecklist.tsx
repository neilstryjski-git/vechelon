import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Tenant {
  id: string;
  name: string;
  slug: string;
  primary_color: string;
  accent_color: string;
  logo_url: string | null;
  qr_mark_url: string | null;
  subdomain_verified: boolean;
  rls_tested: boolean;
}

// ---------------------------------------------------------------------------
// Step wrapper
// ---------------------------------------------------------------------------

function StepShell({
  done,
  label,
  children,
}: {
  done: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-xl border p-5 space-y-4 ${done ? 'bg-tertiary/5 border-tertiary/20' : 'bg-surface-container-lowest border-outline-variant/20'}`}>
      <div className="flex items-center gap-3">
        <span className={`material-symbols-outlined text-xl flex-shrink-0 ${done ? 'text-tertiary' : 'text-on-surface-variant/40'}`}>
          {done ? 'check_circle' : 'radio_button_unchecked'}
        </span>
        <p className={`font-label text-[11px] uppercase tracking-widest font-bold ${done ? 'text-tertiary' : 'text-on-background'}`}>
          {label}
        </p>
      </div>
      <div className="pl-8">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — First Admin
// ---------------------------------------------------------------------------

function AdminStep({ tenantId, hasAdmin }: { tenantId: string; hasAdmin: boolean }) {
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const link = async () => {
    if (!email.trim()) return;
    if (email.trim().toLowerCase() === 'neil.stryjski@gmail.com') {
      setMsg('This email cannot be set as a club admin (VMT-D-32).');
      return;
    }
    setSaving(true);
    setMsg('');

    const { data: account, error: lookupErr } = await supabase
      .from('accounts')
      .select('id')
      .eq('email', email.trim().toLowerCase())
      .maybeSingle();

    if (lookupErr) { setMsg('Lookup failed: ' + lookupErr.message); setSaving(false); return; }
    if (!account) { setMsg('No Vechelon account found for that email. They need to sign up first.'); setSaving(false); return; }

    const { error } = await supabase.from('account_tenants').upsert(
      { tenant_id: tenantId, account_id: account.id, role: 'admin', status: 'affiliated' },
      { onConflict: 'account_id,tenant_id' }
    );

    if (error) { setMsg('Failed: ' + error.message); setSaving(false); return; }

    qc.invalidateQueries({ queryKey: ['pa-admin-check', tenantId] });
    setSaving(false);
    setEmail('');
  };

  if (hasAdmin) {
    return <p className="font-body text-sm text-tertiary">Admin account is connected and has club admin access.</p>;
  }

  return (
    <div className="space-y-3">
      <p className="font-body text-sm text-on-surface-variant/70">
        No admin is linked yet. Enter the email of the first club admin — they must already have a Vechelon account.
      </p>
      <div className="flex gap-2">
        <input
          type="text"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="admin@clubname.ca"
          className="flex-1 bg-surface-container-low border border-outline-variant/30 rounded-lg px-4 py-2.5 font-body text-sm text-on-background placeholder:text-on-surface-variant/30 focus:outline-none focus:border-brand-primary transition-all"
        />
        <button
          onClick={link}
          disabled={saving || !email.trim()}
          className="signature-gradient text-on-primary px-4 py-2.5 rounded-lg font-label text-[10px] uppercase tracking-widest disabled:opacity-50 whitespace-nowrap"
        >
          {saving ? 'Linking…' : 'Link Admin'}
        </button>
      </div>
      {msg && <p className="font-label text-[9px] text-error uppercase tracking-wide">{msg}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — Branding
// ---------------------------------------------------------------------------

async function uploadAsset(tenantId: string, slot: 'logo' | 'qr-mark', file: File): Promise<string> {
  const ext = file.name.split('.').pop() ?? 'png';
  const path = `${tenantId}/${slot}.${ext}`;
  const { error } = await supabase.storage
    .from('tenant-assets')
    .upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from('tenant-assets').getPublicUrl(path);
  return data.publicUrl;
}

function ImageField({
  label,
  url,
  onUrl,
  slot,
  tenantId,
  onUploading,
}: {
  label: string;
  url: string;
  onUrl: (u: string) => void;
  slot: 'logo' | 'qr-mark';
  tenantId: string;
  onUploading: (v: boolean) => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [localErr, setLocalErr] = useState('');

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLocalErr('');
    setUploading(true);
    onUploading(true);
    try {
      const publicUrl = await uploadAsset(tenantId, slot, file);
      onUrl(publicUrl);
    } catch (err: any) {
      setLocalErr(err.message);
    } finally {
      setUploading(false);
      onUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div>
      <label className="font-label text-[9px] uppercase tracking-widest text-on-surface-variant block mb-1.5">{label}</label>
      <div className="flex items-center gap-2">
        {url && (
          <img src={url} alt={label} className="h-10 w-auto max-w-[80px] object-contain rounded border border-outline-variant/20 flex-shrink-0" />
        )}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface-container-low border border-outline-variant/30 font-label text-[9px] uppercase tracking-widest text-on-surface-variant hover:border-brand-primary/40 transition-colors disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-sm">{uploading ? 'hourglass_top' : 'upload'}</span>
          {uploading ? 'Uploading…' : url ? 'Replace' : 'Choose file'}
        </button>
        {url && (
          <input
            type="text"
            value={url}
            onChange={(e) => onUrl(e.target.value)}
            placeholder="or paste URL"
            className="flex-1 min-w-0 bg-surface-container-low border border-outline-variant/30 rounded-lg px-3 py-2 font-mono text-[10px] text-on-surface-variant/70 placeholder:text-on-surface-variant/30 focus:outline-none focus:border-brand-primary transition-all"
          />
        )}
        <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={handleFile} />
      </div>
      {!url && (
        <input
          type="text"
          value={url}
          onChange={(e) => onUrl(e.target.value)}
          placeholder="or paste a URL"
          className="mt-1.5 w-full bg-surface-container-low border border-outline-variant/30 rounded-lg px-4 py-2.5 font-body text-sm text-on-background placeholder:text-on-surface-variant/30 focus:outline-none focus:border-brand-primary transition-all"
        />
      )}
      {localErr && <p className="font-label text-[9px] text-error uppercase tracking-wide mt-1">{localErr}</p>}
    </div>
  );
}

function BrandingStep({ tenant, onSaved }: { tenant: Tenant; onSaved: () => void }) {
  const isDone = !!tenant.logo_url;
  const [editing, setEditing] = useState(!isDone);
  const [primaryColor, setPrimaryColor] = useState(tenant.primary_color);
  const [accentColor, setAccentColor] = useState(tenant.accent_color);
  const [logoUrl, setLogoUrl] = useState(tenant.logo_url ?? '');
  const [qrMarkUrl, setQrMarkUrl] = useState(tenant.qr_mark_url ?? '');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState('');

  const save = async () => {
    setSaving(true);
    setMsg('');
    const { error } = await supabase
      .from('tenants')
      .update({
        primary_color: primaryColor,
        accent_color: accentColor,
        logo_url: logoUrl.trim() || null,
        qr_mark_url: qrMarkUrl.trim() || null,
      })
      .eq('id', tenant.id);

    setSaving(false);
    if (error) { setMsg('Save failed: ' + error.message); return; }
    onSaved();
  };

  if (isDone && !editing) {
    return (
      <div className="space-y-3">
        <p className="font-body text-sm text-tertiary">Branding assets are set.</p>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg border border-outline-variant/20 flex-shrink-0" style={{ backgroundColor: tenant.primary_color }} />
          <div className="w-8 h-8 rounded-lg border border-outline-variant/20 flex-shrink-0" style={{ backgroundColor: tenant.accent_color }} />
          {tenant.logo_url && <img src={tenant.logo_url} alt="logo" className="h-8 w-auto object-contain rounded" />}
        </div>
        <button
          onClick={() => setEditing(true)}
          className="font-label text-[9px] uppercase tracking-widest text-brand-primary hover:opacity-70 transition-opacity"
        >
          Edit branding →
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="font-body text-sm text-on-surface-variant/70">
        Set brand colours and upload logo assets. Files are stored in Supabase Storage.
      </p>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="font-label text-[9px] uppercase tracking-widest text-on-surface-variant block mb-1.5">Primary Colour</label>
          <div className="flex items-center gap-2">
            <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)}
              className="w-10 h-10 rounded-lg border border-outline-variant/30 cursor-pointer bg-transparent p-0.5" />
            <span className="font-mono text-xs text-on-surface-variant">{primaryColor}</span>
          </div>
        </div>
        <div>
          <label className="font-label text-[9px] uppercase tracking-widest text-on-surface-variant block mb-1.5">Accent Colour</label>
          <div className="flex items-center gap-2">
            <input type="color" value={accentColor} onChange={(e) => setAccentColor(e.target.value)}
              className="w-10 h-10 rounded-lg border border-outline-variant/30 cursor-pointer bg-transparent p-0.5" />
            <span className="font-mono text-xs text-on-surface-variant">{accentColor}</span>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <ImageField label="Club Logo" url={logoUrl} onUrl={setLogoUrl} slot="logo" tenantId={tenant.id} onUploading={setUploading} />
        <ImageField label="QR Mark" url={qrMarkUrl} onUrl={setQrMarkUrl} slot="qr-mark" tenantId={tenant.id} onUploading={setUploading} />
      </div>

      {msg && <p className="font-label text-[9px] text-error uppercase tracking-wide">{msg}</p>}

      <button onClick={save} disabled={saving || uploading}
        className="signature-gradient text-on-primary px-5 py-2.5 rounded-lg font-label text-[10px] uppercase tracking-widest disabled:opacity-50">
        {saving ? 'Saving…' : 'Save Branding'}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — Subdomain DNS
// ---------------------------------------------------------------------------

function SubdomainStep({ tenant, onToggle }: { tenant: Tenant; onToggle: () => void }) {
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const toggle = async () => {
    setSaving(true);
    setMsg('');
    const { error } = await supabase.from('tenants').update({ subdomain_verified: !tenant.subdomain_verified }).eq('id', tenant.id);
    setSaving(false);
    if (error) { setMsg('Update failed: ' + error.message); return; }
    onToggle();
  };

  return (
    <div className="space-y-4">
      <p className="font-body text-sm text-on-surface-variant/70">
        Add this DNS record at your domain registrar, then verify the subdomain loads.
      </p>

      {/* DNS script */}
      <div className="bg-surface-container-high rounded-lg border border-outline-variant/20 overflow-hidden">
        <div className="px-4 py-2 border-b border-outline-variant/20 flex items-center justify-between">
          <span className="font-label text-[9px] uppercase tracking-widest text-on-surface-variant">DNS Record</span>
        </div>
        <div className="divide-y divide-outline-variant/10">
          {[
            { key: 'Type',  val: 'CNAME' },
            { key: 'Host',  val: tenant.slug },
            { key: 'Value', val: 'cname.vercel-dns.com' },
            { key: 'TTL',   val: 'Auto (or 3600)' },
          ].map(({ key, val }) => (
            <div key={key} className="flex items-center px-4 py-2.5 gap-6">
              <span className="font-label text-[9px] uppercase tracking-widest text-on-surface-variant w-12 flex-shrink-0">{key}</span>
              <span className="font-mono text-sm text-on-background select-all">{val}</span>
            </div>
          ))}
        </div>
      </div>

      {msg && <p className="font-label text-[9px] text-error uppercase tracking-wide">{msg}</p>}

      <div className="flex items-center gap-3 flex-wrap">
        <a
          href={`https://${tenant.slug}.vechelon.ca`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 font-label text-[10px] uppercase tracking-widest text-brand-primary border border-brand-primary/20 px-4 py-2.5 rounded-lg hover:bg-brand-primary/5 transition-colors"
        >
          <span className="material-symbols-outlined text-sm">open_in_new</span>
          Open {tenant.slug}.vechelon.ca
        </a>

        <button
          onClick={toggle}
          disabled={saving}
          className={`flex items-center gap-2 font-label text-[10px] uppercase tracking-widest px-4 py-2.5 rounded-lg border transition-colors disabled:opacity-50 ${
            tenant.subdomain_verified
              ? 'bg-tertiary/10 text-tertiary border-tertiary/20'
              : 'bg-surface-container-low text-on-surface-variant border-outline-variant/30 hover:border-tertiary/40'
          }`}
        >
          <span className="material-symbols-outlined text-sm">
            {tenant.subdomain_verified ? 'check_circle' : 'radio_button_unchecked'}
          </span>
          {tenant.subdomain_verified ? 'Verified' : 'Mark as Verified'}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 4 — RLS Isolation
// ---------------------------------------------------------------------------

function RlsStep({ tenant, onToggle }: { tenant: Tenant; onToggle: () => void }) {
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const toggle = async () => {
    setSaving(true);
    setMsg('');
    const { error } = await supabase.from('tenants').update({ rls_tested: !tenant.rls_tested }).eq('id', tenant.id);
    setSaving(false);
    if (error) { setMsg('Update failed: ' + error.message); return; }
    onToggle();
  };

  const sql = `-- Run in Supabase SQL Editor (service role)
-- Confirm ${tenant.name} data is isolated

-- Step 1: count rides for this tenant (expect > 0 after first ride)
SELECT count(*) FROM rides WHERE tenant_id = '${tenant.id}';

-- Step 2: sign in as a member of a DIFFERENT club, then run:
-- SELECT count(*) FROM rides WHERE tenant_id = '${tenant.id}';
-- Expect: 0 rows (RLS isolates by tenant)`;

  return (
    <div className="space-y-4">
      <p className="font-body text-sm text-on-surface-variant/70">
        Verify a member of another club cannot see this club's data. Run the SQL below in the Supabase dashboard.
      </p>

      <div className="bg-surface-container-high rounded-lg border border-outline-variant/20 overflow-hidden">
        <div className="px-4 py-2 border-b border-outline-variant/20">
          <span className="font-label text-[9px] uppercase tracking-widest text-on-surface-variant">Verification SQL</span>
        </div>
        <pre className="px-4 py-3 font-mono text-[11px] text-on-background/80 overflow-x-auto whitespace-pre-wrap leading-relaxed">
          {sql}
        </pre>
      </div>

      {msg && <p className="font-label text-[9px] text-error uppercase tracking-wide">{msg}</p>}

      <button
        onClick={toggle}
        disabled={saving}
        className={`flex items-center gap-2 font-label text-[10px] uppercase tracking-widest px-4 py-2.5 rounded-lg border transition-colors disabled:opacity-50 ${
          tenant.rls_tested
            ? 'bg-tertiary/10 text-tertiary border-tertiary/20'
            : 'bg-surface-container-low text-on-surface-variant border-outline-variant/30 hover:border-tertiary/40'
        }`}
      >
        <span className="material-symbols-outlined text-sm">
          {tenant.rls_tested ? 'check_circle' : 'radio_button_unchecked'}
        </span>
        {tenant.rls_tested ? 'Tested' : 'Mark as Tested'}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main checklist
// ---------------------------------------------------------------------------

const ProvisioningChecklist: React.FC = () => {
  const { tenantId } = useParams<{ tenantId: string }>();
  const qc = useQueryClient();

  const { data: tenant, isLoading: loadingTenant } = useQuery({
    queryKey: ['pa-tenant-provision', tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenants')
        .select('id, name, slug, primary_color, accent_color, logo_url, qr_mark_url, subdomain_verified, rls_tested')
        .eq('id', tenantId!)
        .single();
      if (error) throw error;
      return data as Tenant;
    },
    enabled: !!tenantId,
  });

  const { data: hasAdmin } = useQuery({
    queryKey: ['pa-admin-check', tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from('account_tenants')
        .select('id')
        .eq('tenant_id', tenantId!)
        .eq('role', 'admin')
        .limit(1);
      return (data?.length ?? 0) > 0;
    },
    enabled: !!tenantId,
  });

  const refetch = () => qc.invalidateQueries({ queryKey: ['pa-tenant-provision', tenantId] });

  if (loadingTenant) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <span className="material-symbols-outlined text-4xl animate-spin text-on-surface-variant/20">sync</span>
      </div>
    );
  }

  if (!tenant) return null;

  const allDone = !!hasAdmin && !!tenant.logo_url && tenant.subdomain_verified && tenant.rls_tested;

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-2xl">
      <div>
        <Link to="/" className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant hover:text-on-background transition-colors flex items-center gap-1 mb-6">
          <span className="material-symbols-outlined text-sm">arrow_back</span>
          All Clubs
        </Link>
        <span className="font-label text-[10px] uppercase tracking-[0.3em] text-brand-primary mb-2 block font-bold">
          Club Provisioning
        </span>
        <h2 className="font-headline text-4xl font-extrabold tracking-tighter text-on-background italic">
          {tenant.name}
        </h2>
        <p className="text-on-surface-variant text-sm mt-2">
          <span className="font-mono text-on-background bg-surface-container-high px-2 py-0.5 rounded">{tenant.slug}</span>
          {allDone
            ? <span className="ml-3 text-tertiary font-label text-[10px] uppercase tracking-widest">All steps complete</span>
            : <span className="ml-3 font-label text-[10px] uppercase tracking-widest">Complete the steps below before going live.</span>
          }
        </p>
      </div>

      <div className="space-y-3">
        <StepShell done={!!hasAdmin} label="First Admin Linked">
          <AdminStep tenantId={tenant.id} hasAdmin={!!hasAdmin} />
        </StepShell>

        <StepShell done={!!tenant.logo_url} label="Branding Handoff">
          <BrandingStep tenant={tenant} onSaved={refetch} />
        </StepShell>

        <StepShell done={tenant.subdomain_verified} label="Subdomain Verification">
          <SubdomainStep tenant={tenant} onToggle={refetch} />
        </StepShell>

        <StepShell done={tenant.rls_tested} label="RLS Isolation Test">
          <RlsStep tenant={tenant} onToggle={refetch} />
        </StepShell>
      </div>
    </div>
  );
};

export default ProvisioningChecklist;
