# Bulk Member Import — Feature Spec

**Status:** build-ready spec. Sr PM decisions 2026-06-23. **Not a Pillar edit** — an implementation spec for a new admin feature.

## Purpose
Let a tenant **admin** load a **known existing roster** onto their club in one action by uploading a **CSV**, instead of inviting members one at a time. Bulk-wraps the existing `invite-member` edge function (`supabase/functions/invite-member/index.ts`).

## Use case (scope)
- **Known members only** — loading a club's current roster. Not a public/self-serve path.
- **Admin-initiated, admin's tenant only** (rows cannot specify a tenant).
- **Sends an invite email** to each imported member (they need a magic link to sign in).
- **Small batches: hard cap 99 rows per import.**

## CSV format
Header-mapped (column order irrelevant). Template: `docs/bulk-member-import-template.csv`.

| Column | Required | Notes |
|---|---|---|
| `email` | **Yes** | Account key. Row **rejected** if missing/invalid. Normalised to lowercase. |
| `name` | For affiliation | Full name. If absent → member created but **not affiliated** (see Status). |
| `phone` | For affiliation | If absent → member created but **not affiliated**. |
| `role` | No | `member` (default) or `admin`. |
| `emergency_contact_name` | No | Stored if present. |
| `emergency_contact_phone` | No | Stored if present. |

## Status logic (per row)
The admin upload satisfies the **approval** condition (the admin is vouching). The **contact-details** condition decides affiliation:
- Row has **name AND phone** → created **`affiliated`** (full member immediately).
- Row missing name or phone → created **`initiated`** (not affiliated) and **prompted to complete** (name/phone) to become affiliated — via the existing sign-in / email completion prompt. *(No new status — "incomplete" is just the existing pre-affiliated bucket.)*

## Validation & report
**Pre-create checks, surfaced as a list/preview BEFORE anything is written:**
- Row count **≤ 99** (else reject the file).
- Required header `email` present.
- Per row: valid email format; missing/invalid email → flagged.
- **Duplicate emails within the file** → flagged (dedupe).
- **Email already a member of this tenant** → skip (idempotent), reported as "already a member."
- **Email registered to another tenant** (W127 / Pillar II §2.3 cross-club rule) → **reject that row, WITHOUT naming the other club** (data sovereignty, CP-MT-06).

**Per-row result report after submit:** each row → `created-affiliated | created-incomplete | skipped (already member) | failed (reason)`. Failed/skipped rows **downloadable as CSV** to fix and re-upload. **Partial success is normal — one bad row never aborts the batch.**

## Architecture (reuse `invite-member`)
- New edge function **`bulk-create-members`** (or an array mode on `invite-member`). Does the **admin + tenant auth once**, then loops rows applying the per-row logic already in `invite-member`:
  - cross-club email guard → `auth.admin.generateLink` (invite, magic-link fallback) → branded Resend email → upsert `accounts` → upsert `account_tenants {role, status}`.
  - **Enhancement over `invite-member`:** also writes **name / phone / emergency contact** into the profile (`invite-member` writes only email + role). *[Build-time: confirm exact `accounts`/profile columns for name/phone/emergency contact — `invite-member` doesn't touch them.]*
  - **Status** set per the logic above (affiliated vs initiated), not hardcoded `affiliated` as in `invite-member`.
- Admin UI on the **Members** page (`admin/src/pages/Members.tsx`), beside "Invite Member": **"Import CSV"** → upload → **client-side parse** → **preview** (valid vs flagged) → submit → progress → **per-row report** + download-errors. Provide a **template download** (the file above).
- **Multi-tenancy/security:** rows can't specify a tenant; all land in the verified admin's club. Service-role used for upserts, gated strictly on the verified admin + tenant (same posture as `invite-member`).

## Limits / non-goals
- **≤ 99 rows** per import (batch again for more).
- Not a self-serve / public import — **admin-only**.
- **Synchronous** processing (fine at ≤ 99 rows with email throttling); no async/queue.

## Build path (governance)
- Invoke the **`supabase-patterns`** skill before writing the edge function (upsert-on-conflict + Data-API table-grant footguns are directly in scope).
- Track as a **Stride task** (Product Trio lifecycle), reusing `invite-member` (refactor the shared per-row helper so both single and bulk use one path).
