import React from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';

function CheckItem({ done, label, detail }: { done?: boolean; label: string; detail: string }) {
  return (
    <div className={`flex items-start gap-4 p-4 rounded-xl border ${done ? 'bg-tertiary/5 border-tertiary/20' : 'bg-surface-container-lowest border-outline-variant/20'}`}>
      <span className={`material-symbols-outlined text-xl flex-shrink-0 mt-0.5 ${done ? 'text-tertiary' : 'text-on-surface-variant/40'}`}>
        {done ? 'check_circle' : 'radio_button_unchecked'}
      </span>
      <div>
        <p className={`font-label text-[11px] uppercase tracking-widest font-bold ${done ? 'text-tertiary' : 'text-on-background'}`}>
          {label}
        </p>
        <p className="font-body text-sm text-on-surface-variant/70 mt-1 leading-relaxed">
          {detail}
        </p>
      </div>
    </div>
  );
}

const ProvisioningChecklist: React.FC = () => {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [searchParams] = useSearchParams();
  const adminLinked = searchParams.get('admin_linked') === 'true';
  const slug = searchParams.get('slug') ?? '';
  const name = searchParams.get('name') ?? 'New Club';

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <span className="font-label text-[10px] uppercase tracking-[0.3em] text-brand-primary mb-2 block font-bold">
          Club Provisioning
        </span>
        <h2 className="font-headline text-4xl md:text-5xl font-extrabold tracking-tighter text-on-background italic">
          {name} Created
        </h2>
        <p className="text-on-surface-variant text-base mt-3">
          Club <span className="font-mono text-on-background bg-surface-container-high px-2 py-0.5 rounded text-sm">{slug}</span> is provisioned.
          Complete the steps below before going live.
        </p>
      </div>

      <div className="space-y-3">
        <h3 className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant">
          Required Before Launch
        </h3>

        <CheckItem
          done={adminLinked}
          label="First Admin Linked"
          detail={
            adminLinked
              ? 'First admin account is connected and has club admin access.'
              : 'The provided email does not have a Vechelon account yet. Send them an invite link via the invite-member function once they sign up.'
          }
        />

        <CheckItem
          label="Branding Handoff"
          detail="Sr PM supplies logo_url, qr_mark_url, primary_color, and accent_color per VMT-D-36. Update the tenant record in the Supabase dashboard once assets are received. Do not use placeholder branding in production."
        />

        <CheckItem
          label="Subdomain Verification"
          detail={`Configure a DNS CNAME for ${slug}.vechelon.ca pointing to the Vercel deployment. Verify the subdomain resolves and the club portal loads before sharing with members.`}
        />

        <CheckItem
          label="RLS Isolation Test"
          detail="Sign in as a member of another club and confirm they cannot see rides, members, or routes for this tenant. Reference the Pillar III CP-MT-03 verification steps."
        />
      </div>

      <div className="flex gap-4 pt-2">
        <Link
          to={`/?tenant=${tenantId}`}
          className="signature-gradient text-on-primary px-6 py-3 rounded-xl font-headline font-bold tracking-widest uppercase text-xs flex items-center gap-2 shadow-ambient"
        >
          <span className="material-symbols-outlined text-sm">arrow_back</span>
          Back to Platform Home
        </Link>
      </div>
    </div>
  );
};

export default ProvisioningChecklist;
