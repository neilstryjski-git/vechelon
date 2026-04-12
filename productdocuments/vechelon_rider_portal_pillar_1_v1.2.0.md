# Vechelon | Rider Desktop Portal | Pillar I: The Charter (v1.4.0)

Project: Vechelon — Rider Desktop Portal | Current Version: v1.4.0 | Last Sync Date: 2026-04-11 | Status: COMMITTED

---

## Relationship to the Admin Portal

This Pillar set covers the **Rider Desktop Portal** — a subset of the Admin Portal surface. The Rider Portal reuses the same React components as the Admin Portal with role-based rendering — riders see the same components with admin controls hidden, not disabled. No distinct new component types are introduced.

The Rider Portal shares the same Supabase backend, account model, tenant branding system, and data schema as the Admin Portal. It does not redefine those — it references them.

**When this document is silent on a topic, the Admin Portal Pillars (I–IV, v1.2.0 / v1.3.0 / v1.4.0 / v1.2.0) are authoritative.**

**The three surfaces:**

| Surface | Description | Status |
|---|---|---|
| Admin Portal | Full ride management, series creator, calendar management, route library management. Desktop-first. | In build |
| Rider Desktop Portal | Read-only subset of Admin Portal. Member profile, RSVP, route download, calendar, ride detail. Desktop-first, responsive. | This document |
| Mobile Tactical App | Tactical map, Captain mobile, Rider feed, beacon. Mobile-first React Native. | Pending external consultation |

---

## 1. Mission Statement

The Rider Desktop Portal gives club members a browser-based home for their club relationship. It is not a tactical tool — that is the Mobile Tactical App. It is not a full admin tool — that is the Admin Portal.

The Rider Portal is where a member manages their identity, plans their rides, and stays connected to the club calendar and route library — from any device with a browser.

**Desktop-first.** Designed for desktop browser (Chrome/Safari). Responsive for mobile browser — usable but not optimised. The Mobile Tactical App serves the mobile-optimised experience when available.

**No tactical map.** The tactical map is a Mobile Tactical App component exclusively. It does not exist in the Rider Desktop Portal.

**Tagline:** Your club. Your rides.

---

## 2. North Star Constraints

These apply in addition to the Admin Portal North Star constraints.

| Constraint | Rule |
|---|---|
| Subset of Admin Portal | The Rider Portal reuses Admin Portal components. No new component types. Role-based rendering hides admin controls — they are invisible, not disabled. |
| Read-only for riders | Riders cannot create, edit, or delete rides, routes, or club content. |
| No live ride components (MVP) | The Rider Desktop Portal has no tactical map, fleet tracking, or Support Beacon UI for MVP. Live ride components are mobile-only for MVP. Post-MVP may include SAG/Observer desktop map views. |
| No performance data | No fitness metrics, segment times, elevation graphs, or Strava-style data at any tier. |
| Visibility governed by affiliation | What a rider can see depends on their account state and the club's enrollment setting. |
| Consistent with Admin Portal Pillars | All decisions must be consistent with the committed Admin Portal Pillars. No contradictions. |

---

## 3. Authentication

All paths use standard Supabase Auth patterns. Email verification is required for all account types before any access beyond Tier 1.

| Path | Flow |
|---|---|
| New user at club URL (primary MVP flow) | Rider navigates to club URL (e.g. vechelon.app/racer-sportif) → creates account in club context → affiliation established immediately → open = affiliated, manual = pending |
| Admin-led invite | Admin creates account → rider receives email → rider verifies email → rider is immediately Active & Affiliated |
| Existing user, second club (post-MVP) | Rider with existing account explicitly requests affiliation with a new club as a separate step |
| Guest ride participant | Joined a ride via QR with optional name/phone → session cookie persists → can convert to full account at any time |

**Standard auth patterns (LLD for The Hands — Supabase Auth handles natively):**
- Email verification link on account creation
- Password recovery via email
- Magic link option
- Session management and expiry

**Create account / Log in** is accessible and visible at all three tiers. A guest, an initiated rider, or an affiliated member can always access the auth entry point.

---

## 4. The Three Access Tiers

The Rider Portal adapts based on who is viewing it. Branding (logo, colours) is visible immediately on club selection regardless of affiliation state.

### Tier 1 — Guest
Covers two types of visitor:

**a) Unregistered visitor** — navigates to the club portal URL with no account.

**b) Ride guest** — participated in a ride via QR with a session cookie. May have provided optional name and phone. Has a path to convert to a full affiliated account.

**What they see:**
- Club info page — name, logo, description, contact
- Create account / Log in prompt
- Conversion prompt for ride guests — "Claim your ride history by creating an account"

**What they cannot see:**
- Calendar, Route Library, Ride details, RSVP, Member directory

---

### Tier 2 — Initiated (Manual enrollment clubs only)
A rider who has created an account, verified their email, and requested club affiliation at a club whose enrollment_mode is 'manual'. The admin has not yet approved.

**This state does not exist for open enrollment clubs** — they auto-affiliate on email verification. Admin-invited riders also skip this state — email verification immediately grants Active & Affiliated status.

**What they see:**
- Club info page with club branding
- "Your membership is pending approval" banner
- Their own profile (editable)
- Club status (Pending)
- Create account / Log in (always accessible)
- Calendar and ride details — if club setting `show_calendar_to_pending` is enabled

**What they cannot see:**
- RSVP button
- Route Library
- Member directory

---

### Tier 3 — Active & Affiliated
A fully accepted club member via any path — admin invite (email verified), open enrollment (email verified), or manual enrollment (admin approved).

**What they see:**
- Full portal access
- Profile (editable)
- Club status (Active)
- Calendar (read-only)
- Ride details (read-only)
- RSVP for upcoming rides
- Route Library (browse and download)
- Member directory (names visible, contact details not shown)
- Ride attendee list on ride detail (names only — for rides they participated in)
- Create account / Log in (always accessible)

---

## 5. Multi-Membership (Post-MVP Infrastructure)

A rider can belong to multiple clubs simultaneously with independent affiliation states per club. Not exposed in the MVP UI — Racer Sportif is the only tenant.

**Infrastructure future-proofed from day one** via `account_tenants` junction table. No migration required when second club onboards.

**Club switcher** — when a rider belongs to multiple clubs, they switch between club views. Combined view is out of scope. Not surfaced in MVP.

---

## 6. User Personas

### 6.1 The Member Rider (Primary)
- **Who:** A verified, Active & Affiliated club member.
- **Device context:** Desktop browser primarily. Mobile browser as fallback before native app.
- **Core needs:** See upcoming rides. RSVP. Download official routes. Manage their profile.
- **No tactical map:** The rider joins the live ride via the Mobile Tactical App — not the Rider Desktop Portal.

### 6.2 The Initiated Rider (Secondary)
- **Who:** A rider who has created an account and is awaiting admin approval at a manual enrollment club.
- **Core needs:** Understand their status. Know what to expect. Manage their profile.

### 6.3 The Guest (Tertiary)
- **Who:** An unregistered visitor, or a rider who joined a ride via QR and has a session cookie.
- **Core needs:** Understand the club. Create an account. Convert ride guest history to a full account.

---

## 7. Scope — What the Rider Desktop Portal Covers (MVP)

| Feature | Tier 1 Guest | Tier 2 Initiated | Tier 3 Affiliated |
|---|---|---|---|
| Club info page | ✅ | ✅ | ✅ |
| Club branding | ✅ | ✅ | ✅ |
| Create account / Log in | ✅ | ✅ | ✅ |
| Profile edit | — | ✅ | ✅ |
| Club status | — | ✅ (pending) | ✅ (affiliated) |
| Calendar view (read-only) | — | ✅ if show_calendar_to_pending | ✅ |
| Ride details (read-only) | — | ✅ if show_calendar_to_pending | ✅ |
| RSVP for rides | — | — | ✅ |
| Route Library (browse + download) | — | — | ✅ |
| Member directory (names only) | — | — | ✅ |
| Ride attendee list on ride detail | — | — | ✅ (participated rides) |
| Guest ride history conversion prompt | ✅ (ride guests) | — | — |
| Ride history on profile | — | — | Post-MVP |

---

## 8. Out of Scope

| Item | Notes |
|---|---|
| Live ride components | Mobile-only for MVP — no tactical map, fleet tracking, or Support Beacon in Rider Desktop Portal. Post-MVP roadmap may include SAG/Observer desktop map view. |
| Ride creation or editing | Admin Portal only |
| Route upload | Admin Portal only |
| QR join flow | Mobile Tactical App only |
| Performance metrics | Not in Vechelon at any surface |
| In-app messaging | WhatsApp is the communication channel |
| Payment or dues management | Post-MVP |
| Dark mode | Branding is tenant-controlled |
| Ride history on profile page | Post-MVP — attendee list on ride detail is MVP |

---

## 9. Domain Glossary Additions

These terms supplement the Admin Portal Domain Glossary.

| Term | Definition |
|---|---|
| Rider Desktop Portal | The browser-based desktop surface for club members — a read-only subset of the Admin Portal with role-based rendering |
| Admin Portal | The full-featured desktop surface for club administrators — ride management, series creator, calendar, route library management |
| Mobile Tactical App | The React Native mobile app — tactical map, Captain mobile, Rider feed, beacon |
| Tier 1 / 2 / 3 | The three access states in the Rider Portal — Guest, Initiated (manual only), Active & Affiliated |
| Pending Affiliation Screen | Shown to Initiated riders at manual enrollment clubs — confirms status and explains next steps |
| Ride Guest | A rider who joined a ride via QR with a session cookie — has a path to convert to a full affiliated account |

---

## Change Log

| Version | Date | Time (UTC) | Action | Decision | Lead |
|---|---|---|---|---|---|
| v1.0.0 | 2026-04-11 | 12:00 | ADD | Rider Portal Pillar I initialised | TPM |
| v1.1.0 | 2026-04-11 | 13:00 | CHANGE | Tier 2 corrected. Branding visible immediately. Multi-membership future-proofed. Club switcher post-MVP. | TPM |
| v1.2.0 | 2026-04-11 | 14:00 | CHANGE | Rail terminology replaced. Admin Portal subset framing. Auth corrected. Tactical map hard boundary. Desktop-first. Guest expanded. Create/login all tiers. Ride history post-MVP. Member directory Tier 3. | TPM |
| v1.3.0 | 2026-04-11 | 14:30 | CHANGE | Calendar and ride details available to Tier 2 when show_calendar_to_pending enabled. Scope table updated. | TPM |
| v1.4.0 | 2026-04-11 | 15:00 | CHANGE | Live ride components reframed — mobile-only for MVP, not permanent exclusion. Post-MVP SAG/Observer desktop map noted. Account creation flow corrected — club-URL-contextual as primary MVP flow. Second club affiliation moved to post-MVP. Out of scope updated. | TPM |
