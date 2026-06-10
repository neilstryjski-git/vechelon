# Rail 3 — `rail3-staging` setup runbook (W184)

The isolated **free** Supabase project the Rail 3 field PoC runs on. Production is
never touched. Sign-in / invite emails are deliberately branded **`[Rail 3 TEST]`**
so a tester can never confuse them with a real Racer Sportif production email.

## Known values

| Thing | Value |
|---|---|
| Supabase org | `aphajgwscwpseipxkkxn` ("neilstryjski-git's Org") |
| **Production** project (DO NOT TOUCH) | `drktcxggaizkbvqccfhp` — Vechelon, `us-east-1` |
| Staging project name | `rail3-staging` |
| Staging region | `us-east-1` (match prod) |
| Plan | Free (this is the 2nd of 2 free slots) |
| App deep-link scheme | `rail3://auth` |
| Test email templates | `supabase/templates/rail3-staging-magic-link.html`, `rail3-staging-invite.html` |

Record after provisioning: **staging project ref**, **anon key**, **SMTP sender**.

| Field | Value |
|---|---|
| Staging project ref | `xybgtbybdhxuwqjfcfkc` (created 2026-06-10, `us-east-1`, free, ACTIVE_HEALTHY) |
| Staging URL | `https://xybgtbybdhxuwqjfcfkc.supabase.co` |
| Staging anon key | held out of repo — goes in W187's gitignored `mobile/.env` |
| DB password | stored by Sr PM (not retrievable from Supabase later) |
| Test email sender | `__________` (distinct from prod `send.vechelon.ca` — set in step 3) |

---

## ⚠ DECISION (2026-06-10): email goes via the edge function, NOT Supabase SMTP

Production Vechelon does not use Supabase Auth SMTP at all — it sends magic links
via the **`send-magic-link` edge function** (generateLink + Resend HTTP API). Per
the PoC-stays-aligned-to-production principle, Rail 3 follows suit. **So steps 3–4
below (Supabase SMTP + Auth templates) are SUPERSEDED** — that work moves to **W188**
(deploy `send-magic-link` to staging + set the `RESEND_API_KEY` edge secret; the
`[Rail 3 TEST]` HTML here is repurposed as the function's email body). The Supabase
SMTP that was briefly configured on staging is now unused (harmless; can be removed).

This also sidesteps a free-tier gotcha we hit: on free, Supabase Auth template
editing is blocked while using the built-in mailer ("…configure a custom SMTP
provider") — moot now, since Rail 3 doesn't use the Supabase mailer.

What W184 still owns and has DONE: project provisioned (step 1) + `rail3://auth`
redirect allowlist (step 5, set via the Management API).

## Steps

### 1. Create the staging project  *(DONE — ref `xybgtbybdhxuwqjfcfkc`)*
Either the Supabase dashboard (New project → org `neilstryjski-git's Org`, name
`rail3-staging`, region `us-east-1`, free plan, set a strong DB password) **or** the
Management API:

```sh
ACCESS_TOKEN=$(cat ~/.supabase/access-token)
curl -sS -X POST "https://api.supabase.com/v1/projects" \
  -H "Authorization: Bearer $ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d '{
    "organization_id": "aphajgwscwpseipxkkxn",
    "name": "rail3-staging",
    "region": "us-east-1",
    "plan": "free",
    "db_pass": "<GENERATE-AND-STORE-A-STRONG-PASSWORD>"
  }'
```
Provisioning a project + DB password is consequential — run this deliberately (or
do it in the dashboard). Save the returned `ref` + the DB password somewhere safe.

### 2. Link the CLI to staging *(for W185 migrations)*
```sh
npx supabase link --project-ref <STAGING_REF>
```
> ⚠ Re-link to prod when done with staging work, so a later `db push --linked`
> doesn't target the wrong project. Confirm the linked ref before any push (W185).

### 3. Wire Resend SMTP with a DISTINCT sender *(account action)*
In **staging → Authentication → Emails → SMTP**, point at Resend, but use a
**sender distinct from prod's `send.vechelon.ca`** — e.g. a separate verified
subdomain/address like `noreply@rail3-staging.vechelon.ca` (or a clearly-labelled
Resend test sender). The distinct "from" is the first thing that differentiates the
email from production Racer Sportif. Free Resend tier (~100/day) is ample.

### 4. Set the `[Rail 3 TEST]` email templates *(account action)*
In **staging → Authentication → Emails → Templates**, set:

| Template | Subject | Body |
|---|---|---|
| Magic Link | `[Rail 3 TEST] Your sign-in link` | paste `supabase/templates/rail3-staging-magic-link.html` |
| Invite user | `[Rail 3 TEST] You're invited to the PoC ride` | paste `supabase/templates/rail3-staging-invite.html` |

Both templates carry a red "Rail 3 TEST environment" banner so they're unmistakable.

### 5. Redirect allowlist *(DONE via Management API — `rail3://auth` set)*
`uri_allow_list = "rail3://auth"` is already applied. Optionally also add, in
**staging → Authentication → URL Configuration → Redirect URLs**, the
`exp://…/--/auth` dev URL printed by `npx expo start` (for dev iteration).

### 6. Record the values
Fill the table above (ref, anon key, sender) and commit this file.

---

## Guardrails
- **Distinct sender + `[Rail 3 TEST]` templates are mandatory** — test emails must be
  visibly different from production Racer Sportif.
- **Never touch the production project** (`drktcxggaizkbvqccfhp`) auth/email config.
- **2-project free cap** — `rail3-staging` is the one reserved slot.
- **Free projects pause after ~7 days idle** — wake staging before ride day.
- After staging CLI work, **re-link to prod** so migrations don't push to the wrong ref.
