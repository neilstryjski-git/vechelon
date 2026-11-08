// W303 — Google Play reviewer access (App Access). Play reviewers can't receive our
// emailed sign-in code, so ONE staging reviewer identity, named by build config
// (EXPO_PUBLIC_REVIEWER_EMAIL), signs in with a password instead. Exact, case-insensitive
// match only — never a prefix/substring/domain match — and an empty config disables the
// path entirely. The password lives only in Play Console App Access: never in the repo.
// Every other email keeps the emailed-code flow (no general password login).
export function isReviewerEmail(email: string, reviewerEmail: string): boolean {
  const configured = reviewerEmail.trim().toLowerCase();
  if (!configured) return false;
  return email.trim().toLowerCase() === configured;
}
