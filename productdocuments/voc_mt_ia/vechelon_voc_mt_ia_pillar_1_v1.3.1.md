# Vechelon | VoC / MT / IA | Pillar I: The Charter (v1.3.1)

Project: Vechelon — VoC / MT / IA | Current Version: v1.3.1 | Last Sync Date: 2026-04-24 | Status: DRAFT

---

## Relationship to Existing Bedrock

This Pillar set is additive to the committed Vechelon Bedrock (Admin Portal Pillars I–IV and Rider Portal Pillars I–IV). It does not modify, supersede, or reopen those documents. Where schema, RLS, or component decisions are extended, this document references the originating Pillar explicitly.

**Exception:** The Rider Share feature (Section 3.4) requires a UI change to the Rider Portal. The Rider Portal Pillar II will require a formal amendment when The Hands implement this feature. This is the only case in this Pillar set where an existing Pillar document is affected.

**When this document is silent on a topic, the Admin Portal and Rider Portal Pillars are authoritative.**

---

## 1. Mission Statement

Four capabilities are introduced in this Pillar set:

**Voice of Customer (VoC):** A lightweight feedback mechanism that allows Active & Affiliated members to submit bug reports and feature requests directly from the Rider Desktop Portal and the Admin Dashboard. Submissions are routed to GitHub Issues — the platform's public issue tracker — keeping the feedback loop open, transparent, and zero-cost to manage.

**Multi-Tenancy (MT):** The activation of Vechelon's multi-tenant architecture to support a second club, data sovereignty between tenants, and a Platform Admin role for cross-tenant management. The platform moves from a single-tenant deployment at `vechelon.productdelivered.ca/portal` to a subdomain-routed multi-tenant architecture at `clubname.vechelon.ca`.

**Innovation Accounting (IA):** A lightweight event instrumentation layer that logs specific user behaviours across Admin and Rider surfaces. Events are stored in a Supabase table and surfaced to the Sr PM via named SQL views — no third-party analytics tool, no dashboard UI. IA exists to validate or invalidate four adoption hypotheses that determine whether Vechelon is building the right thing and in the right sequence.

**Rider Share:** A new feature that gives non-admin riders a dedicated, rider-traceable share mechanism for ride cards. Replaces the broadcast copy button for rider-facing UI. Enables IA to distinguish organic sharing from admin-initiated broadcasting.

VoC and MT are delivered together because they share the same infrastructure moment. IA and Rider Share are delivered in the same Pillar set because they instrument and extend the adoption model.

---

## 2. North Star Constraints

These apply in addition to the existing Bedrock constraints.

| Constraint | Rule |
|---|---|
| $0 operating cost | VoC uses GitHub Issues. Multi-tenancy uses existing Supabase free tier. IA uses a single Supabase table and SQL views — no third-party analytics tool. Domain hosting on Vercel free plan. |
| Data sovereignty | Each club's data is completely isolated. No cross-tenant data access except for Platform Admin. IA events carry tenant_id and are readable only by Sr PM via service role. Cross-club email associations are not permitted — each club requires a dedicated email. |
| No new account types for riders | Multi-tenancy Phase 1 does not expose multi-membership UI. Riders belong to one club. |
| Platform Admin is additive | The Platform Admin capability is added to an existing account via a flag. Access level within each tenant is determined by the existing account_tenants role — not by the platform_admin flag. |
| IA is Sr PM only | Innovation Accounting metrics are product decision tools for the Sr PM. They are not surfaced in the Platform Admin UI, the club admin portal, or the rider portal. |
| IA is extensible by design | The analytics_events schema and event catalog are designed for future extension. Adding a new hypothesis is an LLD task for The Hands — no Brain re-engagement required. New event types require no schema change. |
| Existing Bedrock untouched | No changes to the Admin Portal or Rider Portal Pillar documents — except the Rider Portal Pillar II amendment required for the Rider Share UI change. |

---

## 3. The Four Features

### 3.1 Voice of Customer (VoC)

A feedback button accessible to Active & Affiliated members in both the Rider Desktop Portal footer and the Admin Dashboard. Opens a lightweight modal — Bug Report or Feature Request, an optional Theme tag, title, and optional detail. Submission creates a GitHub Issue with labels for type, theme, and club. The Platform Admin reviews and manages issues in GitHub — no custom moderation UI required.

**VoC Theme Tags**

An optional dropdown in the submission modal. Mapped to GitHub labels at submission:

| Theme | GitHub Label |
|---|---|
| Navigation | theme:navigation |
| Performance | theme:performance |
| Ride Management | theme:ride-management |
| Membership & Admin | theme:membership-admin |
| Other | theme:other |

Labels are permanent once created in GitHub but trivially manageable. Keep the taxonomy stable — new themes can be added at any time but retroactive relabelling requires manual work.

**What it is not:**
- Not an in-app messaging system
- Not a support ticketing system
- Not visible to non-affiliated users
- Not a voting or upvoting mechanism

### 3.2 Multi-Tenancy

The activation of the multi-tenant architecture already designed into the Bedrock. Phase 1 is developer-provisioned — no self-serve UI.

**Phase 1 (this Pillar set):**
- Second tenant (Bikes & Beers) provisioned manually by The Hands
- Domain migration from `vechelon.productdelivered.ca/portal` to `clubname.vechelon.ca`
- Subdomain routing — app reads subdomain to determine which tenant to load
- Platform Admin role — cross-tenant access with role-inherited permissions
- Full data isolation between Racer Sportif and Bikes & Beers
- Additional real clubs can be provisioned by The Hands. The Hands-provisioned path is valid for real production clubs. No Phase 2 UI gate required. Timing at Sr PM discretion.

**Phase 2 (v3.0 roadmap — not this Pillar set):**
- Self-serve club onboarding flow
- Self-serve branding portal
- Club switcher UI for multi-membership

### 3.3 Innovation Accounting (IA)

A thin instrumentation layer. No UI is built — it is a schema addition, a set of client and server-side event fires, and four Supabase SQL views delivered to the Sr PM.

**The Adoption Model**

```
Admin creates ride → Admin broadcasts to WhatsApp
  → Rider clicks broadcast link → Rider arrives at ride-specific portal page
    → Rider takes action (RSVP, GPX download, external nav)
      → Rider shares ride card → Organic reach beyond the broadcast
        → Rider returns to portal independently (organic adoption)
```

The broadcast link resolves to a ride-specific URL — not the generic portal root. The broadcast (pre-ride WhatsApp message) and the AI Ride Summary (a separate, not-yet-built post-ride feature) are distinct. IA Phase 1 instruments the broadcast flow only.

**Extensibility:** The analytics_events schema and event catalog are designed for future extension. Adding a new hypothesis requires no schema change — only a new event fire and a new SQL view. This is an LLD task for The Hands. No Brain re-engagement is required to add a new hypothesis.

**The Four Hypotheses**

| # | Hypothesis | The Signal | Decision Trigger |
|---|---|---|---|
| H1 | Admin Adoption | If admins use the broadcast copy button shortly after ride creation, the platform fits the admin workflow. | If time-to-broadcast is consistently short, the broadcast feature has value. If long or absent, the workflow is creating overhead — reconsider. |
| H2 | Broadcast-to-Portal Pull | If riders arrive at the ride-specific portal page via the broadcast link, the broadcast is creating portal adoption. | If click-through is healthy, the broadcast is working as an adoption engine. If low, riders are satisfied by the broadcast content alone. |
| H3 | Portal Engagement | If riders arriving via broadcast take additional actions (GPX download, external nav, RSVP), the portal has utility beyond the broadcast. | If riders only RSVP and leave, the portal is a one-trick surface. If they engage further, it has sticky utility. |
| H4 | Information Diversion | If ride attendance is healthy but broadcast click-through is low, the broadcast may be delivering too much information upfront — satisfying the rider before they reach the portal. | A high attendance-to-click ratio is the diversion signal. May indicate the broadcast content should be calibrated to create pull rather than resolution. This is a potential product pivot trigger. |
| H5 | Organic Reach | If riders who arrive via a shared rider link go on to RSVP, download GPX, or tap nav — not just view — the Rider Share feature is generating a genuine growth loop, not just link forwarding. | If shared-link arrivals engage at a similar rate to broadcast arrivals, the platform has viral growth potential. If they only view and leave, the share is informational only. |

**What IA is not:**
- Not a real-time dashboard
- Not visible to club admins or riders
- Not a third-party analytics platform
- Not instrumentation of every user action — only the four hypotheses drive what is logged

### 3.4 Rider Share (New Feature)

A dedicated share mechanism for non-admin riders viewing a ride card. Replaces the broadcast copy button in the rider-facing UI — riders no longer see the admin broadcast button.

**What it does:** Generates a ride-specific, rider-traceable URL that the rider can forward via any channel (WhatsApp, text, email, social). The URL carries a `?source=social&ref=[rider_hash]` parameter that enables IA to distinguish organic sharing from admin-initiated broadcasting and to identify which members are the platform's advocates.

**Scope:** Ride card only. The Share button appears on the ride card view for non-admin riders. It does not appear in ride lists or elsewhere.

**Rider hash:** A deterministic one-way hash of the rider's `user_id`. Not reversible. Not the raw `user_id`. The hash is opaque in the URL but traceable back to the rider by The Hands via service role if needed.

**What changes in the existing UI:**
- The broadcast copy button is removed from the rider-facing ride card view
- Admins retain the broadcast copy button on the admin ride management view
- Riders get a new Share button in its place on the ride card

**What it is not:**
- Not an in-app messaging system
- Not a DM or invite mechanism
- Not visible to guests — affiliated members only

**Future scope:** The exact content of the shareable ride card (what is shown when the link is opened) is LLD. Sr PM leans toward sharing the ride card view only — not the full portal. The Hands propose the implementation in Sprint 0.

---

## 4. Ride URL Source Taxonomy

All portal visits carry a `source` parameter read from the URL on load. This taxonomy is the foundation of the H2 and H4 signals.

| Source Value | Meaning | Generated By |
|---|---|---|
| `broadcast` | Rider arrived via admin-generated broadcast URL | Admin broadcast copy button |
| `social` | Rider arrived via a non-admin rider's share | Rider Share button — includes `ref=[rider_hash]` |
| `ridecard` | Rider arrived via a ride card QR code | QR code on ride card |
| `captain` | Rider arrived via a captain QR code | QR code issued to ride captain |
| `direct` | Rider navigated directly — no source parameter | Typed URL, bookmark, browser history |
| `unknown` | Source parameter present but unrecognised | Defensive catch-all |

**Broadcast vs. Social distinction:** If a rider receives the admin broadcast and forwards the URL without using the Share button, the forwarded URL still carries `?source=broadcast` — it reads as a broadcast visit. Only URLs generated by the Rider Share button carry `?source=social`. This distinction is intentional and clean.

**Second-degree sharing:** If rider A shares via the Share button and rider B receives it, then copies and forwards that URL manually, the `ref` parameter still points to rider A. This is acceptable noise for Phase 1 — the signal is directionally correct.

---

## 5. User Personas

### 5.1 The Platform Admin
- **Who:** Neil Stryjski. Operator of the Vechelon platform.
- **Account:** Single account (`neil.stryjski@gmail.com`) with `platform_admin = true`. Same account used as a rider at Racer Sportif.
- **Access model:** Platform Admin surface is `admin.vechelon.ca`. When a tenant is selected, access level is determined by the Platform Admin's existing `account_tenants` record at that tenant — not the `platform_admin` flag. If a Club Admin record exists at the selected tenant, full Club Admin access is granted. If no record exists, read-only view.
- **Current state:** `neil.stryjski@gmail.com` holds Club Admin at Racer Sportif and Bikes & Beers. Full write access at both. Future production clubs provisioned without this email default to read-only.
- **Constraint:** `neil.stryjski@gmail.com` must not be seeded as an account at future production club tenants. Future clubs are provisioned with their own dedicated admin accounts only.
- **Riding:** When at `racer-sportif.vechelon.ca`, Platform Admin is a regular affiliated member. The `platform_admin` flag has no effect within the club portal.

### 5.2 The Sr PM (IA consumer)
- **Who:** Neil Stryjski in his product decision-making capacity — distinct from his Platform Admin role.
- **Access:** Supabase SQL editor using service role. Four named views surfacing the IA hypotheses.
- **Core needs:** Run a query, read the output, make a product decision. No UI required.
- **Cadence:** Ad hoc — after rides, after onboarding a new club, when evaluating a roadmap decision.

### 5.3 The Affiliated Member (VoC submitter / Rider Share user)
- **Who:** Any Active & Affiliated member at any tenant.
- **VoC:** Submit a bug report or feature request in under 60 seconds.
- **Rider Share:** Share a ride card via a rider-traceable URL. Ride card only.

### 5.4 The Club Admin (existing persona — referenced)
- Defined in Admin Portal Pillar I, Section 5.1. No changes.
- In a multi-tenant context: Club Admin authority is scoped to their own tenant only.

---

## 6. The Test Tenant — Bikes & Beers

| Field | Value |
|---|---|
| Club name | Bikes & Beers |
| Purpose | Platform testing. Isolates test rides and test data from Racer Sportif production data. Used to reproduce and validate fixes for admin-reported issues. |
| URL | bikes-and-beers.vechelon.ca |
| Slug | bikes-and-beers |
| Provisioned by | The Hands — manual DB seed |
| Branding | Sr PM supplies all graphics and branding assets. The Hands must request asset handoff from Sr PM before seeding. Do not use generic placeholders. |
| Status | Test environment only. Not a real club. |

**Configurable options for Hands-provisioned tenants (Phase 1)**

| Option | Field | Notes |
|---|---|---|
| URL | slug | URL-safe, lowercase, hyphen-separated. Immutable after go-live. |
| Club name | name | Display name. Used in UI and GitHub Issue labels. |
| Logo | logo_url | Sr PM supplies asset. Stored as URL reference. |
| Wordmark / Favicon | branding fields | Sr PM supplies assets at provisioning time. |
| Primary colour | primary_color | Hex value. |
| Accent colour | accent_color | Hex value. |
| Enrollment mode | enrollment_mode | open or admin_approval |
| Calendar visibility for pending members | show_calendar_to_pending | Boolean. Default: false. |

---

## 7. Domain Architecture

| Surface | URL | Notes |
|---|---|---|
| Racer Sportif portal | racer-sportif.vechelon.ca | Live production tenant |
| Bikes & Beers portal | bikes-and-beers.vechelon.ca | Test tenant |
| Platform Admin | admin.vechelon.ca | Platform Admin only — not accessible to riders |
| Vechelon marketing | vechelon.productdelivered.ca | Stays as-is — not migrated |
| Vechelon prototype | vechelon.productdelivered.ca/prototype | Stays as-is — not migrated |
| Root domain | vechelon.ca | Redirects to vechelon.productdelivered.ca — transitional |

---

## 8. Glossary Additions

| Term | Definition |
|---|---|
| Platform Admin | The operator-level role with cross-tenant access. A flag on an existing account. Accessed via admin.vechelon.ca. Access level within each tenant is inherited from the existing account_tenants role — not granted by the platform_admin flag. |
| Tenant Slug | The URL-safe identifier for a club used in subdomain routing. Stored in the tenants table. Typing a club subdomain URL does not grant access — an account must be affiliated with that tenant to authenticate. |
| Subdomain Routing | The mechanism by which the app reads the subdomain from the URL to determine tenant context. Authentication is resolved after tenant context is established. |
| VoC | Voice of Customer. The feedback submission mechanism for affiliated members. Backed by GitHub Issues. Accessible from the Rider Desktop Portal footer and the Admin Dashboard. |
| Bikes & Beers | The Vechelon test tenant. Fictional club. Used to isolate test data from Racer Sportif production and to reproduce admin-reported issues. |
| Domain Migration | The move of the Vechelon app from vechelon.productdelivered.ca/portal to clubname.vechelon.ca. |
| Innovation Accounting (IA) | The event instrumentation and SQL view layer used by the Sr PM to validate or invalidate adoption hypotheses. Not a dashboard, not a third-party tool. Sr PM access only via Supabase service role. |
| Broadcast | The pre-ride WhatsApp message generated by the Admin portal. Admin copies it via a button and sends it manually to the club. No AI involved. The broadcast URL is ride-specific. Distinct from the AI Ride Summary (a separate, not-yet-built feature). |
| Rider Share | The share mechanism for non-admin riders. Generates a ride-specific URL with a rider-traceable hash. Appears on the ride card. Replaces the broadcast copy button in the rider-facing UI. |
| Rider Hash | A deterministic one-way hash of a rider's user_id. Used as the `ref` parameter in Rider Share URLs. Opaque in the URL — not the raw user_id. Traceable back to the rider via service role. |
| Social Source | A portal visit originating from a Rider Share URL (?source=social). Distinguishes organic sharing from admin-initiated broadcasting. |
| Information Diversion | The condition where the broadcast message delivers sufficient information to satisfy a rider's need, reducing motivation to click through to the portal. Measured by H4. |
| Analytics Event | A single logged user action in the `analytics_events` table. Carries event_type, user_id, tenant_id, metadata, and created_at. |
| Cross-Club Email | An email address already registered in the Vechelon platform under a different tenant. Each club requires a dedicated email — cross-club email associations are not permitted. |

---

## 9. Out of Scope (This Pillar Set)

| Item | Notes |
|---|---|
| Self-serve club onboarding | Phase 2 — v3.0 roadmap. Hands-provisioned path covers real clubs in Phase 1. |
| Self-serve branding portal | Phase 2 — v3.0 roadmap |
| Club switcher UI for multi-membership | Phase 2 — v3.0 roadmap |
| VoC voting or upvoting | GitHub Issues handles natively if needed |
| VoC status updates to submitter | v4.0 — pending notification infrastructure |
| IA dashboard UI | Not built. Sr PM queries Supabase directly. |
| IA for AI Ride Summary | Feature not yet defined. Placeholder in Pillar IV. |
| Third-party analytics platform | $0 constraint — Supabase only. |
| Third club onboarding via UI | Phase 2 — v3.0 roadmap. Hands-provisioned path valid now. |
| Rider Share — shareable ride card content | LLD. The Hands propose implementation in Sprint 0. Sr PM leans toward ride card view only. |

---

## Change Log

| Version | Date | Time (UTC) | Action | Decision | Lead |
|---|---|---|---|---|---|
| v1.0.0 | 2026-04-21 | 11:00 | ADD | Pillar I initialised — VoC and Multi-Tenancy charter. | TPM |
| v1.1.0 | 2026-04-24 | 00:00 | CHANGE | Sr PM feedback applied. VoC to Admin Dashboard. Theme tag. Hands-provisioned path for real clubs. PA persona clarified. B&B configurable options. Glossary updated. Out of scope updated. | TPM |
| v1.2.0 | 2026-04-24 | 00:00 | ADD | Innovation Accounting added as third feature. Pillar set renamed VoC / MT / IA. Four hypotheses. Sr PM persona. IA glossary terms. | TPM |
| v1.3.1 | 2026-04-24 | 00:00 | ADD | H5 — Organic Reach hypothesis added. Session-scoped attribution via ref hash. | TPM |
| v1.3.0 | 2026-04-24 | 00:00 | ADD / CHANGE | Rider Share added as fourth feature (Section 3.4). Mission updated — four capabilities. Ride URL source taxonomy added (Section 4). H2 updated — ride-specific URL not generic portal. IA scalability enshrined — new hypotheses are LLD tasks. Platform Admin access model updated — role inherited from account_tenants, not granted by platform_admin flag. neil.stryjski@gmail.com scoping constraint added. Bikes & Beers rename (was Bike-and-Beer) throughout. Branding — Sr PM supplies all assets. Cross-club email glossary term added. Rider Portal Pillar II amendment noted in preamble. Glossary: Rider Share, Rider Hash, Social Source, Cross-Club Email added. | TPM |
