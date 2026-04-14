# Vechelon MVP Gap Audit
**Date:** 2026-04-14  
**Author:** Claude Code (independent analysis)  
**Source:** All four Pillar documents + live codebase inspection

---

## Methodology

This audit walks every BDD scenario defined in Pillar III: The V-Model, every mandate in Pillar I: The Charter and Pillar II: The Specs, and derives new scenarios where the pillars imply behaviour that is not explicitly written. Each scenario is assessed against the live codebase — not documentation or memory.

The Three Amigos framework is applied to gaps: **Business** (is this the right thing?), **Dev** (how hard is it?), **QA** (how do we know it works?).

---

## Section 1 — Pillar III Official BDD Scenarios

### Scenario A — 1-Tap Guest Join
> *Given a guest scans the QR code at the start line. When they enter no name and hit "Join." Then a UUID is stored in localStorage, and an anonymous "Guest" icon appears on the map.*

**Status: FAILED**

The QR code is generated correctly (`RideFormModal.tsx`) and points to `${VITE_JOIN_BASE_URL}/join/{rideId}`. That URL has no handler in the current portal. The `joinRide` action in `useAppStore.ts` explicitly throws `'Not authenticated'` for unauthenticated users, with a comment noting anonymous join is deferred to W64.

**Gaps to close:**
- A `/ride/:rideId` entry point route in the portal (also satisfies the QR→RSVP scenario below)
- Anonymous `joinRide` path that uses `session_cookie_id` instead of `account_id`

---

### Scenario B — Google Link Resolver
> *Given Fab pastes a shortened Google Maps link. When the AI resolves the redirect. Then the system extracts the business name and populates finish coordinates. If unresolvable, a Hard Fail prevents publishing.*

**Status: FAILED**

`maps.ts` contains polyline encoding utilities only. `RideFormModal.tsx` has no Google Maps URL input field. The Gemini-powered resolver from Pillar II §2.2 has not been built. Only GPX upload and manual coordinate input are available.

**Gap to close:** A URL input field in the ride creation flow with a Gemini edge function to resolve `maps.app.goo.gl` short links.

---

### Scenario C — Selective Purge
> *Given a ride ends. When 4 hours have elapsed. Then the Pro-Tour summary is saved, GPS breadcrumbs are wiped, and the attendance list remains queryable.*

**Status: PARTIAL**

✅ `hard-purge-location` edge function exists and nullifies `last_lat`/`last_long` for participants in rides with `status = 'saved'` and `actual_end` older than 4 hours.  
✅ `auto-close-rides` transitions active rides to `saved` at midnight.  
✅ `generate-ride-summary` edge function + `endRide` store action produce the Pro-Tour summary.  
✅ Attendance (`ride_participants.display_name`) is retained after purge.

❌ **Phone is not scrubbed.** Pillar II §5 mandates DELETE on `Rider.phone` at Expiry + 4h. The purge function only nullifies coordinates.

**Gap to close:** Add `phone: null` to the `hard-purge-location` UPDATE statement. One-line fix.

---

## Section 2 — Pillar-Defined Scenarios Not in Pillar III

### Scenario D — Captain Eviction
> *Pillar I §4: Captains are authorised to evict ghost riders or technical glitches from the map.*

**Status: FAILED**

The `ride_participants.role` enum supports `captain`. No eviction button exists anywhere in the tactical map UI (`InteractiveMap.tsx`, `Dashboard.tsx`, `ParticipantDetailSheet.tsx`). No `status = 'evicted'` transition exists in the codebase. The captain role cannot be assigned at join time.

---

### Scenario E — Support Vehicle Beacon
> *Pillar I §4 + Pillar IV Phase I: The Support role is represented by a distinct pulsing beacon.*

**Status: FAILED**

The `ride_participants.role` enum supports `support`. The interactive map renders all participants identically. No UI affordance exists to join as Support, and no visual distinction (orange/pulsing) is applied for Support markers.

---

### Scenario F — 0-Tap Member Re-identification
> *Pillar II §1: Members are identified via the `vechelon_auth` cookie with zero taps.*

**Status: VERIFIED** *(via equivalent mechanism)*

The pillar was written before the Supabase pivot. Supabase JWT sessions persist in `localStorage` and survive browser restarts. A returning member who has previously done magic-link auth is auto-identified without any interaction. The mandate is met; the implementation mechanism differs from the original spec.

---

### Scenario G — Pro-Tour Summary
> *Pillar I §4: The Captain finalises the ride to trigger the Pro-Tour summary.*

**Status: VERIFIED**

`generate-ride-summary` edge function, `endRide` action in `useAppStore.ts`, and `EndRideButton` component are all wired end-to-end. AI-generated summary is captured and surfaced in the ride closure flow.

---

## Section 3 — New Scenarios (Not in Any Pillar)

These scenarios are implied by the product's core model but never explicitly written. They were identified through codebase analysis and stakeholder use-case review.

---

### Scenario H — Admin Invites a Club Member
> *Admin enters a rider's email → rider receives a branded magic link → clicks link → account created at Initiated status → Admin affiliates them.*

**Status: IMPLEMENTED (this session)**

The pillars describe a self-service registration model only, but a club with existing members cannot onboard them without an admin-initiated invitation path. The `Members.tsx` page now includes an "Invite Member" button that triggers `supabase.auth.signInWithOtp` on behalf of the admin. The recipient receives the existing branded magic link email. Their account is created via `ensure_account_exists()` with `status = 'initiated'`, and they appear in the Pending Affiliation tab.

**Three Amigos:**
- **Business:** Essential for club launch. Without this, the admin has no way to bring in existing club members.
- **Dev:** Uses the existing `signInWithOtp` + `ensure_account_exists` pipeline — no new infrastructure.
- **QA:** Verify email arrives (Supabase inbucket in dev). Verify recipient lands in Pending tab. Verify that an existing account receives a sign-in link, not a duplicate. Verify admin cannot bypass affiliation — invited user still starts at `initiated`.

---

### Scenario I — QR Code → Pre-Ride RSVP
> *A member sees the QR code displayed on the admin dashboard before race day. They scan it from their phone, are taken to the ride's portal page, and can RSVP.*

**Status: MISSING**

This exposes a design ambiguity: **the QR currently has one URL but two intended uses**.

| Context | User | Expected Destination |
|---------|------|---------------------|
| Pre-ride (status: created) | Club member | Portal ride page with RSVP button |
| Race day (status: active) | Guest/Member | Live tactical map (mobile join flow) |

The current QR points to `https://vechelon.app/join/{rideId}`, which assumes the live map context. There is no portal route `/ride/:rideId` that handles either case.

**Recommended solution:** A single `/ride/:rideId` smart landing page in the portal that branches on ride status:
- `created` → show ride details card + RSVP button (same as RiderHome next-ride card, but ride-specific)
- `active` → redirect to the live tactical map URL
- `saved` → show post-ride summary / attendance

The QR URL should be updated from the mobile join URL to `/portal/ride/{rideId}`.

**Three Amigos:**
- **Business:** Closes the physical-to-digital loop. A QR at a café meetup or on a club group chat becomes a one-tap RSVP. High club value.
- **Dev:** New `/ride/:rideId` route + one branching component. Moderate. Requires the QR base URL config (`VITE_JOIN_BASE_URL`) to be updated to point at the portal.
- **QA:** Verify unauthenticated user hitting the route sees sign-in prompt. Verify member gets RSVP. Verify active ride redirects to tactical map. Verify completed ride shows summary. Edge case: what if the ride is cancelled?

---

## Section 4 — Gemini Gap Hunt Scenarios (Status Update)

| ID | Scenario | Previous Status | Current Status |
|----|----------|----------------|----------------|
| A1 | GPX → Interactive Builder handoff | PARTIAL | PARTIAL — W62 in Gemini queue |
| A2 | Interactive Builder Persistence | VERIFIED | ✅ VERIFIED |
| A3 | Tactical Triage (WhatsApp sidesheet) | VERIFIED | ✅ VERIFIED |
| A4 | Member Approval | FAILED | ✅ RESOLVED — W60 complete |
| R1 | Access Tier Gating | VERIFIED | ✅ VERIFIED |
| R2 | RSVP Handshake (Join button) | FAILED | ✅ RESOLVED — Gemini wired RiderHome |
| R3 | Profile → Admin Triage Sheet | PARTIAL | ✅ RESOLVED — DB trigger added |
| G1 | Magic Link Registration | VERIFIED | ✅ VERIFIED |
| G2 | History Conversion (cookie → account) | FAILED | FAILED — W63 in Gemini queue |

---

## Section 5 — Complete Gap Register

| Priority | Scenario | Status | Effort | Owner |
|----------|----------|--------|--------|-------|
| 🔴 Now | Selective Purge — phone scrub | PARTIAL | Trivial (1 line) | Claude |
| 🟠 Soon | QR → Pre-Ride RSVP landing page (I) | MISSING | Medium | Claude |
| 🟠 Soon | 1-Tap Guest Join / W64 (A) | FAILED | Medium | Claude |
| 🟡 Milestone | Captain Eviction UI (D) | FAILED | Medium | Claude |
| 🟡 Milestone | Google Link Resolver (B) | FAILED | Medium-High | Gemini |
| 🟡 Milestone | GPX → Builder Handoff | PARTIAL | Medium | Gemini W62 |
| 🟡 Milestone | History Conversion | FAILED | Medium | Gemini W63 |
| 🔵 Phase II | Support Vehicle Beacon (E) | FAILED | Medium | Either |

---

## Section 6 — Summary for Product Trio

**What's solid:** The admin command centre (rides, builder, map, triage), the full member lifecycle (magic link → initiated → affiliated), the portal structure (tier gating, calendar, routes, profile), and the ride closure / Pro-Tour summary pipeline are all working.

**The one missing seam for club launch:** A member who is invited by the admin currently has no path from their email to the portal to the RSVP flow via the existing QR infrastructure. Scenario H (admin invite) is now implemented. Scenario I (QR → RSVP landing) is the next piece that closes the loop.

**Guest on map is the big unbuilt feature:** Scenario A (anonymous guest join at the start line) is the most consequential unbuilt scenario because it is central to the Pillar I Zero-Friction mandate. It is architecturally sound but not started.
