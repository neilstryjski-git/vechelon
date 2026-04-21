# Brain Session: Domain Migration & Multi-Tenant Architecture
**Date:** 2026-04-21  
**Initiated by:** The Hands (Claude Code)  
**Status:** Awaiting Brain session — no implementation started  
**Classification:** As-is brief with recommendation — not an amendment. Multi-tenancy is chartered (ref: `account_tenants` junction table, Pillar 2 specs). This brief addresses the implementation path and hosting decisions not yet made.

---

## Context

Vechelon is currently deployed at `vechelon.productdelivered.ca/portal/`. The product is approaching a point where a second club tenant is a near-term reality. The owner holds `vechelon.ca`.

Two previously separate concerns — domain migration and multi-tenant routing — have converged into a single architectural decision that should be made once, correctly, before any code is written.

---

## What We Know

### Current State
- **URL:** `vechelon.productdelivered.ca/portal/`
- **React Router basename:** `/portal`
- **Tenant loading:** `SELECT * FROM tenants LIMIT 1` — hardcoded single-tenant, grabs row 1
- **Data model:** Already multi-tenant capable — `account_tenants` junction table, all RLS policies scoped by `tenant_id`
- **Domain owned:** `vechelon.ca`

### What the Data Model Supports Today
- A user can belong to multiple clubs (`account_tenants` is a junction table)
- RLS isolates data by `tenant_id` per user session
- The **only missing piece is the routing layer** — the app doesn't know which tenant to load

---

## The Core Decision

**How does the app know which tenant it is serving?**

Three options, evaluated:

| Approach | URL Example | LOE | Multi-membership | Migration Risk |
|---|---|---|---|---|
| User-based (login → load their tenant) | `vechelon.ca/portal` | Small | No — breaks with 2+ clubs | High — rewrites needed later |
| Path-based | `vechelon.ca/c/clubname/` | Medium | Yes | Medium |
| **Subdomain-based** | `clubname.vechelon.ca` | Medium-Large | Yes | Low — correct from day one |

**Recommendation from The Hands:** Subdomain routing on `vechelon.ca`. Reasons:
- Cleanest UX — each club feels independently branded
- Supports multiple memberships from day one
- Wildcard SSL (`*.vechelon.ca`) is standard and automatable
- Aligns with white-labelling potential in future roadmap
- Migration cost from user-based would exceed the cost of doing it right now

---

## Open Questions for Brain Session

### 1. Infrastructure — What is `productdelivered.ca`?
- Is this a client's server, a shared host, a VPS you control?
- Are static files served from there, or does it proxy to Supabase Storage?
- **Decision needed:** Stay on this host (point vechelon.ca DNS at it) or migrate hosting entirely?

### 2. Hosting Target
Where do the compiled static files (`dist/`) live after this move?

| Option | Cost | Wildcard SSL | CDN | Complexity |
|---|---|---|---|---|
| Netlify | Free–$19/mo | ✅ Automatic | ✅ | Low |
| Vercel | Free–$20/mo | ✅ Automatic | ✅ | Low |
| Cloudflare Pages | Free | ✅ Automatic | ✅ | Low |
| Self-hosted (current) | Variable | Manual | Manual | Higher |

Netlify/Vercel/Cloudflare Pages all handle wildcard subdomains and automatic SSL natively — recommended for a team this size.

### 3. Supabase Auth Redirect URLs
Currently scoped to `productdelivered.ca`. Moving domains requires updating:
- Supabase Auth → Redirect URLs whitelist
- Magic link base URL
- Any OAuth providers if added later

### 4. Public Club Home Page
- Does `clubname.vechelon.ca` serve both the public-facing club page AND the authenticated portal?
- Or does `vechelon.ca` (root) serve a Vechelon product/marketing page separately?
- **This affects DNS architecture** — root vs wildcard routing

### 5. Timeline Pressure
- Is there a second club onboarding soon that forces a decision date?
- Can the domain migration and multi-tenant build be done as one coordinated release, or does domain need to move first?

### 6. Super Admin Role
- Who provisions new tenants? (insert into `tenants`, configure branding, assign first admin)
- For now: manual SQL is acceptable
- Future: super admin UI — is this in scope for v1.x or v2.0?

---

## What Does NOT Need Brain Input

These are implementation decisions The Hands can execute once routing model is confirmed:

- Reading subdomain from `window.location.hostname`
- Tenant lookup query (subdomain → tenant row)
- React Router basename change (`/portal` → `/`)
- Updating Supabase auth redirect URLs
- RLS — no changes needed, already tenant-scoped

---

## Suggested Brain Session Agenda

1. Confirm hosting target (Netlify / Vercel / Cloudflare / stay current)
2. Confirm routing model (subdomain recommended)
3. Confirm public home page architecture (root vs subdomain)
4. Set timeline — is there a second club waiting?
5. Define super admin provisioning scope for v1.x

**Estimated implementation LOE once decisions are made:** 3–5 days including DNS propagation, hosting migration, app routing changes, and UAT on a staging subdomain.

---

## Reference
- Current tenant query: `admin/src/App.tsx` line 131–135
- `account_tenants` schema: Pillar 2 specs
- RLS policies: `supabase/migrations/`
