# Vechelon | VoC / MT / IA | Pillar IV: The Ledger (v1.3.2)

Project: Vechelon — VoC / MT / IA | Current Version: v1.3.2 | Last Sync Date: 2026-04-28 | Status: DRAFT

---

## Reference

The Admin Portal Ledger (Pillar IV v1.2.0) and Rider Portal Ledger (Pillar IV v1.4.0) contain foundational decisions for the Vechelon platform. This document records only decisions specific to VoC, Multi-Tenancy, Innovation Accounting, and Rider Share.

---

## 1. Decision History

| # | Date | Decision | Rationale | Lead |
|---|---|---|---|---|
| VMT-D-01 | 2026-04-21 | Subdomain routing chosen over path-based and user-based routing | Cleanest UX. Wildcard SSL free on Vercel with nameserver delegation. Migration cost later would exceed cost of doing it correctly now. | PM + Eng |
| VMT-D-02 | 2026-04-21 | vechelon.ca DNS moves to Vercel nameservers — productdelivered.ca unchanged | Wildcard SSL requires Vercel nameserver control. Clean separation: vechelon.ca is the product, productdelivered.ca is the portfolio. | Eng |
| VMT-D-03 | 2026-04-21 | Wildcard subdomain on free Vercel plan — no upgrade required | Vercel supports wildcard SSL on all plans with their nameservers. $0 cost. | Eng |
| VMT-D-04 | 2026-04-21 | Bikes & Beers established as test tenant | Racer Sportif is a live production club. Test data must be isolated. Bikes & Beers also serves as environment to reproduce admin-reported issues. | PM |
| VMT-D-05 | 2026-04-21 | Phase 1 tenant provisioning is manual — no UI | Manual SQL provisioning by The Hands is a fully supported path for real production clubs. Self-serve onboarding is v3.0 scope — a convenience upgrade, not a new capability. Timing at Sr PM discretion. | PM |
| VMT-D-06 | 2026-04-21 | Platform Admin is a flag on existing account — not a separate account | Single login for Neil Stryjski. Access level within each tenant is determined by account_tenants role — not the platform_admin flag. | PM + Design |
| VMT-D-07 | 2026-04-21 | Platform Admin cannot access location data | 4-hour Hard Purge applies universally — including the platform operator. No exemptions. | PM |
| VMT-D-08 | 2026-04-21 | VoC backed by GitHub Issues — no custom database or moderation UI | $0 cost. Built-in labelling, filtering, status management. Aligns with build-in-the-open philosophy. | PM + Eng |
| VMT-D-09 | 2026-04-21 | VoC submissions labelled with club slug server-side | Client-provided values can be spoofed. Edge Function derives tenant slug from account_tenants. | Eng |
| VMT-D-10 | 2026-04-21 | VoC rate limited to 5 submissions per member per hour | Prevents spam. 5/hour is permissive — hitting the limit is unexpected. Clock starts on successful submission only. | Eng |
| VMT-D-11 | 2026-04-21 | VoC visible to Tier 3 (Active and Affiliated) only | Signal quality — feedback from active members is more actionable. | PM |
| VMT-D-12 | 2026-04-21 | Platform Admin surface at admin.vechelon.ca — separate from club portals | Distinct subdomain keeps platform admin clearly separated from club experience. Not advertised or linked from club portals. | Design |
| VMT-D-13 | 2026-04-24 | Brain-defined HLD schema extensions do not require Pillar V Amendment | Pillar V triggered only when The Hands deviate from the Brain's HLD spec during LLD. Original v1.0.0 language was incorrect. | PM + Eng |
| VMT-D-14 | 2026-04-21 | Existing Racer Sportif sessions will not survive domain migration | Session cookies are domain-scoped. One-time re-login is expected behaviour — not a defect. | Eng |
| VMT-D-15 | 2026-04-21 | productdelivered.ca marketing and prototype remain untouched | Not part of the product deployment. | PM |
| VMT-D-16 | 2026-04-24 | VoC theme tag added to submission modal | Optional dropdown, 5 stable themes, mapped to GitHub labels. Triage signal from day one at minimal friction. | PM |
| VMT-D-17 | 2026-04-24 | VoC accessible from Admin Dashboard in addition to Rider Portal footer | Same Edge Function, same flow. Zero infrastructure cost. | PM |
| VMT-D-18 | 2026-04-24 | Platform Admin lightweight stats in Phase 1 scope | Read-only stats: rider counts by tier per tenant, total ride count per tenant. Direct Supabase queries. $0. Full analytics at v6.0. | PM |
| VMT-D-19 | 2026-04-24 | Platform Admin Club Creation UI — Sprint 0 LOE gate | Lightweight "Create Club" form desirable for Phase 1. The Hands assess LOE and flag in session. Ships Phase 1 if LOE is low; defers to Phase 2. | PM |
| VMT-D-20 | 2026-04-24 | Innovation Accounting adopted as third capability in this Pillar set | IA instruments the adoption model that VoC and MT depend on. Same infrastructure moment. | PM |
| VMT-D-21 | 2026-04-24 | IA implemented as single Supabase table + four SQL views — no third-party tool | $0 cost. Sr PM queries directly via Supabase SQL editor with service role. No dashboard UI in Phase 1. | PM + Eng |
| VMT-D-22 | 2026-04-24 | IA events logged with tenant_id from day one — multi-tenant by default | Adding tenant_id at logging costs nothing. Retroactive partitioning is expensive. | Eng |
| VMT-D-23 | 2026-04-24 | IA primary consumer is Sr PM only — not surfaced in Platform Admin or club UI | IA is a product decision tool. analytics_events: service role only. | PM |
| VMT-D-24 | 2026-04-24 | Four IA hypotheses defined — only events serving these hypotheses are logged | H1: Admin Adoption. H2: Broadcast-to-Portal Pull. H3: Portal Engagement. H4: Information Diversion. No instrumentation beyond these four. | PM |
| VMT-D-25 | 2026-04-24 | Broadcast and AI Ride Summary are distinct — IA Phase 1 instruments broadcast only | Broadcast is a pre-ride planning tool requiring no AI. Ride Summary is separate, not-yet-defined. IA will instrument it when the feature is defined. | PM |
| VMT-D-26 | 2026-04-24 | Information Diversion (H4) is a formal product hypothesis — a potential pivot trigger | H4 may indicate the broadcast content should be calibrated to create pull rather than resolution. Direct product design implication. | PM |
| VMT-D-27 | 2026-04-24 | IA is extensible by design — new hypotheses are LLD tasks | The analytics_events schema supports future extension without schema changes. New event type + new SQL view = new hypothesis. No Brain re-engagement required. This is an LLD task for The Hands. | PM + Eng |
| VMT-D-28 | 2026-04-24 | Rider Share added as fourth feature — replaces broadcast copy button for non-admin riders | Currently riders and admins see the same broadcast copy button. Rider Share creates a dedicated, ride-specific, rider-traceable share mechanism for non-admin riders. Enables IA to distinguish organic sharing (social) from admin broadcasting. Broadcast copy button retained for admins only. | PM |
| VMT-D-29 | 2026-04-24 | Rider Share URL is ride-specific and carries a rider-traceable hash | Generic social URL tells you sharing happened. Ride-specific URL tells you what's worth sharing. Rider hash is a deterministic one-way hash of user_id — opaque in URL, not the raw user_id. Privacy maintained. New hypothesis possible: which rides generate organic sharing. | PM + Eng |
| VMT-D-30 | 2026-04-24 | Rider hash implementation is LLD — The Hands determine the exact approach | The Brain specifies deterministic one-way hash of user_id, not exposed as raw user_id. The Hands determine the hashing method and lookup function. | PM + Eng |
| VMT-D-31 | 2026-04-24 | Platform Admin access level inherited from account_tenants — not from platform_admin flag | Platform Admin sees all tenants. Access level within each tenant is determined by whether an account_tenants record exists for that tenant. Club Admin record = full write access. No record = read-only. Consistent and data-driven. | PM |
| VMT-D-32 | 2026-04-24 | neil.stryjski@gmail.com scoped to Racer Sportif and Bikes & Beers only | This email holds Club Admin at these two tenants. It must not be seeded at future production clubs. Future clubs provision their own dedicated admin accounts. | PM |
| VMT-D-33 | 2026-04-24 | Cross-club email associations not permitted | Each club requires a dedicated email. An email registered under another tenant may not be invited to a new tenant. Graceful error returned — does not reveal which club the email belongs to. Data sovereignty applies to error messages. | PM + Eng |
| VMT-D-34 | 2026-04-24 | Bikes & Beers renamed from Bike-and-Beer | Plural is correct. Slug: bikes-and-beers. Name: Bikes & Beers. | PM |
| VMT-D-35 | 2026-04-24 | Edge test cases are Sr PM human tasks in Stride | Edge cases in P3 that require human execution are created as Stride tasks by The Hands, assigned to Sr PM, moved to "ready to review" when dependent code is testable. | PM |
| VMT-D-36 | 2026-04-24 | Sr PM branding assets supplied for all tenant provisioning — no generic placeholders | Sr PM supplies all graphics and branding assets. The Hands must request asset handoff before seeding any tenant. | PM |
| VMT-D-37 | 2026-04-24 | H2 sources ride-specific URL — not generic portal root | The broadcast link resolves to a ride-specific URL. The portal_visit event captures the ride_id from the URL context. This is the correct unit of measurement for H2. | PM + Eng |
| VMT-D-38 | 2026-04-24 | H5 — Organic Reach added as fifth hypothesis | H5 measures whether riders arriving via a shared rider link go on to engage — RSVP, GPX download, nav tap — or just view. Engagement distinguishes a genuine growth loop from passive link forwarding. Attribution is session-scoped via the ref hash from the Rider Share URL. No new schema required — same analytics_events table, new ia_h5_organic_reach view. Adding new hypotheses is an LLD task — no Brain re-engagement required. | PM |
| VMT-D-39 | 2026-04-28 | Rider Portal Pillar II amendment waived — VoC / MT / IA Pillar set is authoritative for Share button + VoC modal UI | The new pillar set is a peer of Rider Portal Pillar II, not a child. VoC / MT / IA Pillar I §3.1 and §3.4 plus Pillar II §5 and §6.4 fully specify the VoC modal and Share button UI. Cross-referencing in this ledger is sufficient — no separate amendment file required. Closes the dependency previously called out in §5 (Bedrock relationship map) and the Share button amendment line in §2 (Roadmap). | PM + Eng |
| VMT-D-40 | 2026-04-28 | Shared Landing is viewer-state-driven, refining VMT-D-29 / VMT-D-38 | The original "ride card view only" lean (Pillar I §3.4) applies only to unauthenticated and unverified-email viewers. Verified viewers (any tier ≥ 2) get the full portal experience at the same `/ride/<id>` route — rendered conditionally based on viewer auth state, not URL source. Logged-out viewers see a stripped-down ride card with a "Create an account" CTA and a magic-link entry on the same page; on authentication the view unlocks to the full portal with the ride context preserved. Logged-in but unverified-email viewers see the same stripped-down layout with a "Verify your email" CTA. QR sources (`?source=ridecard`, `?source=captain`) receive the same viewer-state-driven treatment as `?source=social`. Source param drives H5 attribution via the `ref` hash but does not alone determine visual treatment. | PM |
| VMT-D-41 | 2026-04-28 | rider_hash LLD locked — HMAC-SHA256(user_id, vault_secret) truncated to 12 base32 chars | Per VMT-D-30 the hash method was Hands LLD; this row records the locked-in approach. Server secret stored in Supabase Vault, consistent with the existing GitHub PAT pattern (MT-S0-10). PL/pgSQL reverse-lookup function loops accounts and recomputes — O(n), non-issue at our member scale. No schema change required. NFR-validated $0 cost and sub-millisecond share-generation latency. Web Share API is the share mechanism with clipboard-copy fallback. | PM + Eng |
| VMT-D-42 | 2026-04-28 | portal_visit fires once per session arrival — not per route change | Confirms Pillar II §6.3 session-scope language. The event fires on initial page load only; source / ref / ride_id are read from the URL at that moment and persisted in sessionStorage for downstream H5 attribution. Internal route changes within an existing session do not fire portal_visit. Page refresh and new tabs each count as new session arrivals. This is what the H2 / H4 ratio views in Pillar II §6.5 are designed to count. | PM + Eng |
| VMT-D-43 | 2026-04-28 | Ride share URL route corrected to singular `/ride/<id>` to align with codebase | Pillar II §6.4 + Pillar III RS-04 originally specified `/rides/[ride-id]?source=social&ref=[hash]` (plural). The actual codebase uses singular `/ride/:rideId` (`admin/src/App.tsx:181` Route definition; `admin/src/components/RideDetailSideSheet.tsx:224` broadcast URL builder). Path of least resistance is correcting the pillar to match shipping code rather than renaming the route. Pillars II and III bumped to v1.3.2 with this correction. Surfaced during G20 (Frictionless Sign Up III) cross-walk analysis. | PM + Eng |

---

## 2. Roadmap (Deferred Value)

| Item | Description | Dependencies |
|---|---|---|
| Self-serve club onboarding | Club admin creates their own tenant via UI. Hands-provisioned path remains valid. | v3.0 |
| Self-serve branding portal | Club admin configures logo, colours, slug. | v3.0 |
| Club switcher UI | Rider switches between clubs in the portal. | v3.0 — account_tenants UI |
| Platform Admin analytics (full) | Comprehensive cross-tenant dashboard. | v6.0 |
| Real club onboarding (3rd tenant and beyond) | Hands-provisioned path available now. UI path at v3.0. | Hands: now. UI: v3.0. |
| VoC voting or upvoting | GitHub Issues supports natively. | On demand |
| VoC status updates to submitter | Notify member when issue is actioned. | v4.0 notification infrastructure |
| Custom domain per club | Clubs use their own domain. | v3.0+ |
| Platform Admin Club Creation UI (if deferred) | Ships Phase 1 if Sprint 0 LOE is low. | v3.0 if deferred |
| IA — AI Ride Summary instrumentation | Event logging for post-ride summary. Placeholder — feature not yet defined. | Pending Ride Summary definition |
| IA — Strava API integration signals | Instrumentation for Strava-connected activity. | v6.0 |
| IA dashboard UI | Purpose-built UI for Sr PM without Supabase SQL editor. | v6.0 or when required |
| Rider Share — shareable ride card content spec | Closed by VMT-D-40 — Shared Landing is viewer-state-driven; spec recorded in Pillar IV §1. | Closed |
| IA — Rider advocacy hypothesis (H5) | Which members generate the most organic sharing and engaged visits. Built — ia_h5_organic_reach view delivered by The Hands in IA-S0-06. | Phase 1 |

---

## 3. Sprint 0 Tasks

Full list in Pillar II, Section 7. Carried here for reference.

| # | Task | Sr PM Action | Status |
|---|---|---|---|
| MT-S0-01 | Vercel nameserver migration | 🧑 Porkbun nameserver update | 🔴 Not Started |
| MT-S0-02 | Supabase Auth redirect URL update | — | 🔴 Not Started |
| MT-S0-03 | Subdomain routing implementation | — | 🔴 Not Started |
| MT-S0-04 | React Router basename change | — | 🔴 Not Started |
| MT-S0-05 | Bikes & Beers tenant seed | 🧑 Provide branding assets | 🔴 Not Started |
| MT-S0-06 | Platform Admin schema extension | — | 🔴 Not Started |
| MT-S0-07 | Platform Admin RLS policies | — | 🔴 Not Started |
| MT-S0-08 | Platform Admin surface build | — | 🔴 Not Started |
| MT-S0-08a | Platform Admin — Club Creation LOE assessment | 🧑 LOE decision in session | 🔴 Not Started |
| MT-S0-09 | GitHub Issues labels setup | — | 🔴 Not Started |
| MT-S0-10 | VoC Edge Function — voc-submit | — | 🔴 Not Started |
| MT-S0-11 | Cross-club email validation | — | 🔴 Not Started |
| MT-S0-12 | Staging subdomain validation | — | 🔴 Not Started |
| MT-S0-13 | Production cutover coordination | 🧑 UAT sign-off | 🔴 Not Started |
| IA-S0-01 | analytics_events table and indexes | — | 🔴 Not Started |
| IA-S0-02 | Broadcast source parameter — LOE assessment | 🧑 LOE decision in session | 🔴 Not Started |
| IA-S0-03 | Client-side event instrumentation | — | 🔴 Not Started |
| IA-S0-04 | Server-side event instrumentation | — | 🔴 Not Started |
| IA-S0-04a | ride_closed event hook — LOE assessment | 🧑 LOE decision in session if workaround needed | 🔴 Not Started |
| IA-S0-05 | Rider Share feature | 🧑 Approve ride card share content | 🔴 Not Started |
| IA-S0-06 | SQL views build and delivery | — | 🔴 Not Started |

---

## 4. Strategic Dissent Log

| # | Date | Topic | Dissent | Resolution |
|---|---|---|---|---|
| VMT-SD-01 | 2026-04-21 | User-based vs subdomain routing | Engineering noted user-based routing would be lower LOE for Phase 1. | PM confirmed subdomain routing is correct from day one. Migration cost later exceeds cost of doing it right now. |
| VMT-SD-02 | 2026-04-21 | VoC custom database vs GitHub Issues | Engineering flagged GitHub Issues has limited query capability. | PM confirmed GitHub Issues for Phase 1. Zero cost, zero infrastructure, public transparency. Custom table valid future path if insufficient. |
| VMT-SD-03 | 2026-04-24 | IA third-party tool vs Supabase views | Engineering noted tools like PostHog would provide richer visualisation. | PM confirmed Supabase views. $0 constraint is firm. Sr PM is comfortable with SQL. Third-party tool evaluable at Phase 2 if views prove insufficient. |

---

## 5. Relationship to Existing Bedrock

| Existing Decision | Bedrock Location | Relationship |
|---|---|---|
| account_tenants junction table | Rider Portal Pillar II, Section 2 | Extended by Platform Admin role inheritance model |
| RLS policies — tenant isolation | Admin Portal Pillar II, Section 12 | Extended by Platform Admin bypass. analytics_events explicitly excluded. |
| Tenant branding injection | Admin Portal Pillar II, Section 11 | Unchanged — subdomain routing replaces LIMIT 1 only |
| Hard Purge — 4-hour deletion | Admin Portal Pillar II, Section 12 | Unchanged — applies universally including Platform Admin |
| Magic Link auth | Admin Portal Pillar II, Section 2 | Extended — redirect URLs updated for new subdomains |
| VoC feedback modal | Rider Portal Pillar II, Section 4.10 | Server-side implementation added. Extended to Admin Dashboard. |
| Broadcast (WhatsApp message generation) | Admin Portal Pillar II (ride management) | Extended — broadcast URL must include ?source=broadcast for IA. The Hands assess LOE in IA-S0-02. |
| Ride card UI | Rider Portal Pillar II | Amendment waived per VMT-D-39 — VoC / MT / IA Pillar I §3.4 + Pillar II §6.4 are authoritative for the Share button UI change (broadcast copy button removed from rider-facing UI; Share button added for non-admin riders). |

---

## Change Log

| Version | Date | Time (UTC) | Action | Decision | Lead |
|---|---|---|---|---|---|
| v1.0.0 | 2026-04-21 | 11:00 | ADD | Pillar IV initialised — 15 decisions, roadmap, Sprint 0, dissent log, Bedrock relationship map. | TPM |
| v1.1.0 | 2026-04-24 | 00:00 | CHANGE | VMT-D-05 reframed. VMT-D-10 corrected. VMT-D-13 corrected. VMT-D-16 through D-19 added. Roadmap updated. Sprint 0 synced. | TPM |
| v1.2.0 | 2026-04-24 | 00:00 | ADD | VMT-D-20 through D-26 added. IA roadmap placeholders. VMT-SD-03. Broadcast source extension noted. | TPM |
| v1.2.1 | 2026-04-24 | 00:00 | CHANGE | IA-S0-04a added. Sprint 0 table updated. | TPM |
| v1.3.1 | 2026-04-24 | 00:00 | ADD | VMT-D-38 — H5 Organic Reach. Roadmap H5 entry updated — Phase 1 scope. | TPM |
| v1.3.0 | 2026-04-24 | 00:00 | ADD / CHANGE | VMT-D-27 through D-37 added: IA extensibility as LLD, Rider Share decisions, Platform Admin role inheritance, neil.stryjski scoping constraint, cross-club email, Bikes & Beers rename, edge cases as Stride tasks, Sr PM branding assets, H2 ride-specific URL. Roadmap: Rider Share content spec, Rider Portal II amendment, IA H5 placeholder added. Sprint 0: Sr PM action column added. MT-S0-11 cross-club email. MT-S0-13 renamed. IA-S0-05 Rider Share. IA-S0-06 renamed. Bedrock relationship map: Platform Admin role inheritance, Ride card UI amendment added. | TPM |
| v1.3.2 | 2026-04-28 | 00:00 | ADD / CHANGE | Brain ratifications session (Sr PM in-session). VMT-D-39 — Rider Portal Pillar II amendment waived; new pillar set is authoritative. VMT-D-40 — Shared Landing is viewer-state-driven, refining VMT-D-29/38. VMT-D-41 — rider_hash LLD locked (HMAC-SHA256 + Vault). VMT-D-42 — portal_visit fires once per session arrival. VMT-D-43 — Ride share URL corrected to singular `/ride/<id>` to align with codebase (Pillars II and III companion-bumped to v1.3.2). §2 Roadmap: Rider Portal II amendment row removed; Rider Share content spec marked Closed. §5 Bedrock map: Ride card UI row updated to reference VMT-D-39. | The Hands (Claude Code) |
