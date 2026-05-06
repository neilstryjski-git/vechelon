import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

const BLOCKED_EMAILS = ['neil.stryjski@gmail.com'];
const SLUG_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function fieldError(field: string, value: string): string | null {
  if (field === 'slug') {
    if (!value) return 'Slug is required';
    if (!SLUG_RE.test(value)) return 'Lowercase letters, numbers, and hyphens only (no leading/trailing hyphen)';
  }
  if (field === 'name') {
    if (!value.trim()) return 'Club name is required';
  }
  if (field === 'first_admin_email') {
    if (!value.trim()) return 'First admin email is required';
    if (!EMAIL_RE.test(value.trim())) return 'Enter a valid email address';
    if (BLOCKED_EMAILS.includes(value.trim().toLowerCase())) return 'This email cannot be set as a club admin (VMT-D-32)';
  }
  return null;
}

const CreateClub: React.FC = () => {
  const navigate = useNavigate();
  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [enrollmentMode, setEnrollmentMode] = useState<'open' | 'manual'>('open');
  const [firstAdminEmail, setFirstAdminEmail] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    const slugErr = fieldError('slug', slug);
    const nameErr = fieldError('name', name);
    const emailErr = fieldError('first_admin_email', firstAdminEmail);
    if (slugErr) next.slug = slugErr;
    if (nameErr) next.name = nameErr;
    if (emailErr) next.first_admin_email = emailErr;
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSlugChange = (val: string) => {
    const normalized = val.toLowerCase().replace(/[^a-z0-9-]/g, '');
    setSlug(normalized);
    if (errors.slug) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next.slug;
        return next;
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    setSubmitError('');

    const { data, error } = await supabase.rpc('create_club', {
      p_slug: slug,
      p_name: name.trim(),
      p_enrollment_mode: enrollmentMode,
      p_first_admin_email: firstAdminEmail.trim().toLowerCase(),
    });

    setSubmitting(false);

    if (error) {
      const msg = error.message ?? 'Failed to create club';
      if (msg.includes('invalid_slug')) setErrors({ slug: 'Invalid slug format' });
      else if (msg.includes('first_admin_email_blocked')) setErrors({ first_admin_email: 'This email cannot be set as a club admin (VMT-D-32)' });
      else if (msg.includes('duplicate') || msg.includes('unique')) setErrors({ slug: 'This slug is already taken' });
      else setSubmitError(msg);
      return;
    }

    const result = data as { tenant_id: string; admin_linked: boolean };
    navigate(
      `/clubs/${result.tenant_id}/provisioning?admin_linked=${result.admin_linked}&slug=${encodeURIComponent(slug)}&name=${encodeURIComponent(name.trim())}`
    );
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-xl">
      <div>
        <Link to="/" className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant hover:text-on-background transition-colors flex items-center gap-1 mb-6">
          <span className="material-symbols-outlined text-sm">arrow_back</span>
          All Clubs
        </Link>
        <span className="font-label text-[10px] uppercase tracking-[0.3em] text-brand-primary mb-2 block font-bold">
          Platform Admin
        </span>
        <h2 className="font-headline text-4xl font-extrabold tracking-tighter text-on-background italic">
          Create New Club
        </h2>
        <p className="text-on-surface-variant text-sm mt-2">
          Branding assets are supplied by Sr PM post-creation (VMT-D-36). Do not use placeholder logos.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Slug */}
        <div>
          <label className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant block mb-2 px-1">
            Club Slug
          </label>
          <input
            type="text"
            value={slug}
            onChange={(e) => handleSlugChange(e.target.value)}
            placeholder="racer-sportif"
            className={`w-full bg-surface-container-low border rounded-xl px-5 py-4 font-mono text-sm text-on-background placeholder:text-on-surface-variant/30 focus:outline-none transition-all ${errors.slug ? 'border-error' : 'border-outline-variant/30 focus:border-brand-primary'}`}
          />
          {errors.slug ? (
            <p className="font-label text-[9px] text-error uppercase tracking-wide mt-1.5 px-1">{errors.slug}</p>
          ) : (
            <p className="font-label text-[9px] text-on-surface-variant/50 uppercase tracking-wide mt-1.5 px-1">
              Used for subdomain: {slug ? `${slug}.vechelon.ca` : '<slug>.vechelon.ca'}
            </p>
          )}
        </div>

        {/* Name */}
        <div>
          <label className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant block mb-2 px-1">
            Club Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Racer Sportif"
            className={`w-full bg-surface-container-low border rounded-xl px-5 py-4 font-body text-sm text-on-background placeholder:text-on-surface-variant/30 focus:outline-none transition-all ${errors.name ? 'border-error' : 'border-outline-variant/30 focus:border-brand-primary'}`}
          />
          {errors.name && (
            <p className="font-label text-[9px] text-error uppercase tracking-wide mt-1.5 px-1">{errors.name}</p>
          )}
        </div>

        {/* Enrollment Mode */}
        <div>
          <label className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant block mb-2 px-1">
            Enrollment Mode
          </label>
          <select
            value={enrollmentMode}
            onChange={(e) => setEnrollmentMode(e.target.value as 'open' | 'manual')}
            className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl px-5 py-4 font-body text-sm text-on-background focus:outline-none focus:border-brand-primary transition-all"
          >
            <option value="open">Open — anyone can join</option>
            <option value="manual">Manual — admin approves each member</option>
          </select>
        </div>

        {/* First Admin Email */}
        <div>
          <label className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant block mb-2 px-1">
            First Admin Email
          </label>
          <input
            type="text"
            value={firstAdminEmail}
            onChange={(e) => setFirstAdminEmail(e.target.value)}
            placeholder="admin@clubname.ca"
            className={`w-full bg-surface-container-low border rounded-xl px-5 py-4 font-body text-sm text-on-background placeholder:text-on-surface-variant/30 focus:outline-none transition-all ${errors.first_admin_email ? 'border-error' : 'border-outline-variant/30 focus:border-brand-primary'}`}
          />
          {errors.first_admin_email ? (
            <p className="font-label text-[9px] text-error uppercase tracking-wide mt-1.5 px-1">{errors.first_admin_email}</p>
          ) : (
            <p className="font-label text-[9px] text-on-surface-variant/50 uppercase tracking-wide mt-1.5 px-1">
              Club admin role. If no account exists yet, they will be linked on first sign-in.
            </p>
          )}
        </div>

        {submitError && (
          <div className="bg-error/10 border border-error/20 rounded-lg p-3 flex items-start gap-3">
            <span className="material-symbols-outlined text-error text-lg">report</span>
            <p className="font-label text-[10px] text-error leading-tight uppercase tracking-wide">{submitError}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full signature-gradient text-on-primary py-4 rounded-xl font-headline font-bold tracking-widest uppercase text-sm flex items-center justify-center gap-3 hover:opacity-90 transition-all active:scale-[0.98] disabled:opacity-50 shadow-ambient"
        >
          {submitting ? (
            <>
              <span className="material-symbols-outlined text-xl animate-spin">sync</span>
              Provisioning…
            </>
          ) : (
            <>
              <span className="material-symbols-outlined text-xl">add_circle</span>
              Create Club
            </>
          )}
        </button>
      </form>
    </div>
  );
};

export default CreateClub;
