# Vechelon | Rider Desktop Portal | Pillar IV: The Ledger (v1.4.0)

Project: Vechelon — Rider Desktop Portal | Current Version: v1.4.0 | Last Sync Date: 2026-04-11 | Status: COMMITTED

---

## Reference

The Admin Portal Ledger (Pillar IV v1.2.0) contains all foundational decisions for the Vechelon platform. This document records only decisions specific to the Rider Desktop Portal.

---

## 1. Decision History

| # | Date | Decision | Rationale | Lead |
|---|---|---|---|---|
| RP-D-01 | 2026-04-08 | Rider Desktop Portal established as a distinct surface alongside the Admin Portal | Admin Portal delivers immediate value without waiting for mobile consultation gate. Rider Portal extends the desktop surface to members without impacting the committed Admin Portal Pillars. | PM |
| RP-D-02 | 2026-04-08 | Rider Portal is a subset of Admin Portal — shared components, role-based rendering | No new component types introduced. Same React component library, same Supabase backend. Admin controls are hidden for riders — invisible, not disabled. Avoids duplication and drift. | Eng + Design |
| RP-D-03 | 2026-04-08 | Three-tier access model — Guest / Initiated / Affiliated | Access reflects the existing account state machine from the Admin Portal. No new account types needed. | PM + Eng |
| RP-D-04 | 2026-04-11 | Initiated/pending state applies to rider-led request at manual enrollment clubs only | Open enrollment clubs auto-affiliate on email verification. Admin invites go straight to Affiliated after email verification. Pending state is exclusively for rider-led requests at manual enrollment clubs. | PM |
| RP-D-05 | 2026-04-08 | Admin controls are invisible to riders — not disabled | Disabled controls create confusion and imply availability under different conditions. Invisible controls keep the rider experience clean. | Design |
| RP-D-06 | 2026-04-08 | RSVP is intent only — consistent with Admin Portal | RSVP'd riders do not appear on the tactical map until they explicitly Join on ride day. Admin Portal decision carried forward identically. | PM + Eng |
| RP-D-07 | 2026-04-08 | Calendar is read-only for riders | Riders consume the club calendar — Admin Portal is the creation surface. | PM |
| RP-D-08 | 2026-04-08 | Route Library is read-only for riders — download only | Admin-curated routes are the club's official assets. Rider upload deferred per Admin Portal D-30. | PM |
| RP-D-09 | 2026-04-11 | Ride history on profile is post-MVP — attendee list on ride detail is MVP | Tight scope for MVP. ride_participants records (names) persist after the Hard Purge. Attendee list is visible on ride detail for rides the rider participated in. Full history on profile page is post-MVP. | PM |
| RP-D-10 | 2026-04-08 | Profile edit includes photo — excludes bike type | Photo is useful for club identity. Bike type excluded — many members have multiple bikes, adds friction without clear MVP value. | PM |
| RP-D-11 | 2026-04-08 | Rider Portal is desktop-first, responsive for mobile browser | Mobile browser is a fallback before the native app. Not optimised for mobile — the Mobile Tactical App serves that need. | PM + Design |
| RP-D-12 | 2026-04-11 | Voice of Customer (VoC) function deferred — requires Trio session | VoC identified in Addendum 001 as needing Product Trio collaboration before spec. Not in this Pillar set. | PM |
| RP-D-13 | 2026-04-11 | Admin invite + email verification = immediately Active & Affiliated | Admin-initiated invites represent pre-approved affiliation. Email verification confirms identity — no separate admin approval step needed. | PM |
| RP-D-14 | 2026-04-11 | Open enrollment auto-affiliates on email verification — no pending state | Open enrollment is a deliberate club choice for low friction. Pending state only applies to manual enrollment clubs. | PM |
| RP-D-15 | 2026-04-11 | Multi-membership via account_tenants junction table — infrastructure future-proofed, zero MVP impact | Rider may belong to multiple clubs with independent affiliation states per club. Replaces single tenant_id on accounts. Racer Sportif is the only MVP tenant — one record per rider. No migration needed when second club onboards. | Eng |
| RP-D-16 | 2026-04-11 | Club switcher pattern for multi-membership — combined view out of scope | Riders switch between club views. Combined cross-club view is significantly more complex and not required. | PM |
| RP-D-17 | 2026-04-11 | Tactical map is a hard boundary — Mobile Tactical App only | The tactical map does not exist in the Rider Desktop Portal at any tier or state. Any live ride link directs to the Mobile Tactical App join flow. | PM + Eng |
| RP-D-18 | 2026-04-11 | Email verification required for all account paths | Admin invite, open enrollment, and manual enrollment all require email verification before any portal access beyond Tier 1. Standard auth patterns (password recovery, magic link) handled by Supabase Auth. | Eng |
| RP-D-19 | 2026-04-11 | Guest visitor definition expanded — includes ride guests with session cookie | A guest is either an unregistered visitor or a rider who joined a ride via QR with a session cookie. Ride guests have a conversion path to a full affiliated account. Cookie matching is best-effort. | PM |
| RP-D-20 | 2026-04-11 | Create account / Log in accessible at all three tiers | Auth entry point is always visible and accessible regardless of affiliation state. A rider at any tier can always authenticate or create an account. | Design |
| RP-D-21 | 2026-04-11 | Member directory visible (read-only) to affiliated members — names only | Consistent with Admin Portal visibility rules. Contact details remain admin/captain only. Riders see names and profile photos — no phone, email, or emergency contact. | PM |
| RP-D-22 | 2026-04-11 | account_tenants schema change requires Pillar V Amendment from The Hands | The Admin Portal schema is COMMITTED. account_tenants extends it. The Hands must submit a Pillar V Amendment before implementing this schema change. | Eng |
| RP-D-23 | 2026-04-11 | Calendar available to Tier 2 riders when show_calendar_to_pending is enabled — low effort, implemented in MVP | A single boolean field on tenants controls whether pending riders at manual enrollment clubs can see the calendar and ride details. No new components. Default false. RSVP, Route Library, and member directory remain Tier 3 only. | PM + Eng |
| RP-D-24 | 2026-04-11 | Account creation is club-URL-contextual as the primary MVP flow | A new user creates their account in the context of a specific club URL. Affiliation is established as part of creation — not a separate subsequent step. The club URL is the entry point. Open enrollment = immediately affiliated. Manual enrollment = pending. | PM |
| RP-D-25 | 2026-04-11 | Live ride components are mobile-only for MVP — not a permanent exclusion | The tactical map, fleet tracking, and Support Beacon are mobile-only for MVP. Post-MVP roadmap may include SAG vehicle and Observer desktop map view. The architecture supports this — it is a UI scope decision, not an architectural constraint. | PM + Eng |

---

## 2. Roadmap (Deferred Value)

| Item | Description | Dependencies |
|---|---|---|
| Club switcher UI | Nav selector for riders belonging to multiple clubs. Infrastructure (account_tenants) supports from day one. UI not surfaced until second club onboards. | Multi-tenant onboarding |
| Voice of Customer (VoC) | Logged-in riders submit feature ideas. Admin reviews and marks No / MVP / Roadmap. Requires Trio session before spec. | Trio session — Addendum 001 |
| Ride history on profile | Chronological list of rides the rider participated in, shown on their profile page. | Post-MVP |
| Guest view configuration | Club admin controls what guests can see on the public portal beyond club info. | Admin settings UI |
| Payment and dues management | Membership dues, payment status, renewal. | Third-party payment integration |
| Ride stats on history | Distance, duration, elevation for participated rides. | Mobile Tactical App |
| Bike type / equipment profile | Member records their bike(s). Useful for SAG support on long rides. | Low priority |
| Admin branding portal | Club admin self-serves logo, colours, URL slug. Referenced in Admin Portal roadmap. | Tenant admin dashboard |

---

## 3. Sprint 0 Tasks

Rider Desktop Portal-specific Sprint 0 tasks. See Admin Portal Pillar IV for the full platform Sprint 0 list.

| # | Task | Context |
|---|---|---|
| RP-S0-01 | RLS policy extension | Rider read access to rides, route_library, own account, attendee names on participated rides. Cross-tenant isolation confirmed. |
| RP-S0-02 | Profile photo upload | Supabase Storage bucket config. Max 2MB, image validation, square crop. |
| RP-S0-03 | Tier detection logic | Account state detection on portal load — Guest (no account), Guest (ride cookie), Initiated (manual), Affiliated. Navigation adapts per tier. |
| RP-S0-04 | RSVP state management | ride_participants read/write for own records. Test RSVP create and cancel. Confirm no auto-transition to Active. |
| RP-S0-05 | Calendar library selection | React calendar library for monthly grid. Ride event rendering and click-through to ride detail. |
| RP-S0-06 | account_tenants Pillar V Amendment | The Hands submit a Pillar V Amendment for the account_tenants schema extension before implementing. Admin Portal schema is COMMITTED. |
| RP-S0-07 | Shared component library validation | Confirm Admin Portal components can be reused in Rider Portal with role-based rendering. Identify any components requiring a rider-specific variant. |

---

## 4. Strategic Dissent Log

| # | Date | Topic | Dissent | Resolution |
|---|---|---|---|---|
| RP-SD-01 | 2026-04-11 | Open enrollment Tier 2 with calendar/route access | Original v1.0.0 spec showed open enrollment Initiated riders accessing calendar and routes while pending. Design flagged this could imply full membership before formal affiliation. | Resolved by correcting the model — open enrollment clubs auto-affiliate on email verification. There is no open enrollment pending state. Tier 2 exists only at manual enrollment clubs. |

---

## 5. Relationship to Addendum 001

Addendum 001 (2026-04-08) identified the Rider Desktop Portal following customer validation. This Pillar set is the formal product response.

**Addressed in this Pillar set:**
- ✅ RSVP for rides
- ✅ Download routes pinned to rides
- ✅ Calendar view of rides
- ✅ Logged-in and guest view rules
- ✅ Profile editing

**Deferred — pending Trio session:**
- ⏳ Voice of Customer function
- ⏳ Further feature iteration rules

---

## Change Log

| Version | Date | Time (UTC) | Action | Decision | Lead |
|---|---|---|---|---|---|
| v1.0.0 | 2026-04-11 | 12:00 | ADD | Rider Portal Pillar IV initialised | TPM |
| v1.1.0 | 2026-04-11 | 13:00 | CHANGE | RP-D-13 through RP-D-16 added. Club switcher roadmap added. | TPM |
| v1.2.0 | 2026-04-11 | 14:00 | CHANGE | Rail terminology replaced throughout. RP-D-02 updated — Rider Portal as Admin Portal subset. RP-D-04 corrected — pending state manual enrollment only. RP-D-09 corrected — ride history post-MVP, attendee list MVP. RP-D-17 through RP-D-22 added. Tactical map boundary, email verification, guest expansion, create/login accessibility, member directory, Pillar V Amendment requirement all logged. RP-SD-01 updated. Sprint 0 tasks RP-S0-06 and RP-S0-07 added. | TPM |
| v1.3.0 | 2026-04-11 | 14:30 | CHANGE | RP-D-23 added — show_calendar_to_pending field, calendar access for Tier 2. | TPM |
| v1.4.0 | 2026-04-11 | 15:00 | CHANGE | RP-D-24 added — club-URL-contextual account creation as primary MVP flow. RP-D-25 added — live ride components mobile-only for MVP, not permanent exclusion. | TPM |
