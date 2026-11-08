// W303 — Google Play reviewer access (App Access). Play reviewers can't receive our
// emailed sign-in code, so ONE staging reviewer identity, named by build config
// (EXPO_PUBLIC_REVIEWER_EMAIL), signs in with a password instead. Exact, case-insensitive
// match only — never a prefix/substring/domain match — and an empty config disables the
// path entirely. The password lives only in Play Console App Access: never in the repo.
// Every other email keeps the emailed-code flow (no general password login).
// The reviewer path exists ONLY on the staging backend (exact URL match, mirroring the
// exact-match redirect allowlist). A prod-backed build gets '' even if eas.json still sets
// EXPO_PUBLIC_REVIEWER_EMAIL, so the prod switch can't carry it over by accident.
export const STAGING_SUPABASE_URL = 'https://xybgtbybdhxuwqjfcfkc.supabase.co';

export function reviewerEmailFor(supabaseUrl: string, configuredEmail: string): string {
  return supabaseUrl.trim().replace(/\/+$/, '') === STAGING_SUPABASE_URL ? configuredEmail : '';
}

export function isReviewerEmail(email: string, reviewerEmail: string): boolean {
  const configured = reviewerEmail.trim().toLowerCase();
  if (!configured) return false;
  return email.trim().toLowerCase() === configured;
}
