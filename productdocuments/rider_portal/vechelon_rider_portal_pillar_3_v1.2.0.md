# Vechelon | Rider Desktop Portal | Pillar III: The Quality Gate (v1.4.0)

Project: Vechelon — Rider Desktop Portal | Current Version: v1.4.0 | Last Sync Date: 2026-04-11 | Status: COMMITTED

---

## Reference

BDD scenarios for the tactical map, QR join flow, Support Beacon, Hard Purge, and WhatsApp Bridge are defined in **Admin Portal Pillar III: The Quality Gate (v1.4.0)**. This document covers only Rider Desktop Portal-specific scenarios.

---

## 1. Definition of Done

A Rider Desktop Portal feature is not [COMMITTED] until:

1. **Strategic Lead (PM):** The feature respects the three-tier access model. Admin controls are invisible to riders — not disabled. No tactical map components present.
2. **Structural Lead (Engineering):** RLS policies tested. Riders cannot read other tenants' data, other riders' contact details, or admin-only data. account_tenants Pillar V Amendment submitted.
3. **Experience & Validation Lead (Design/QA):** Passing BDD scenario. Desktop-first rendering validated. Mobile browser responsive check passed.

---

## 2. BDD Scenario Index

| # | Feature Area | Scenario | Priority |
|---|---|---|---|
| RP-01 | Access — Guest (no account) | Unregistered visitor views club portal | P0 |
| RP-02 | Access — Guest (ride guest) | Ride guest visits portal with session cookie | P0 |
| RP-03 | Access — Initiated | Rider pending at manual enrollment club | P0 |
| RP-04 | Access — Account Creation | New user creates account at club URL — primary MVP flow | P0 |
| RP-04b | Access — Second Club | Existing user adds second club affiliation — post-MVP | Post-MVP |
| RP-05 | Access — Affiliated | Affiliated member sees full portal | P0 |
| RP-06 | Auth | Email verification required before access | P0 |
| RP-07 | Auth | Admin invite path — email verification grants affiliation | P0 |
| RP-08 | Auth | Create account / log in accessible at all tiers | P0 |
| RP-09 | Profile | Rider edits profile fields | P0 |
| RP-10 | Profile | Rider uploads profile photo | P1 |
| RP-11 | Profile | Rider cannot view another rider's profile | P0 |
| RP-12 | Calendar | Affiliated rider views monthly calendar | P0 |
| RP-13 | Calendar | Rider clicks ride on calendar | P0 |
| RP-14 | Ride Detail | Rider views ride detail | P0 |
| RP-15 | Ride Detail | Admin controls invisible to rider | P0 |
| RP-16 | Ride Detail | Attendee list visible for participated rides | P0 |
| RP-17 | RSVP | Affiliated rider RSVPs for a ride | P0 |
| RP-18 | RSVP | Affiliated rider cancels RSVP | P0 |
| RP-19 | RSVP | RSVP not available to Initiated rider | P0 |
| RP-20 | Route Library | Affiliated rider browses and downloads | P0 |
| RP-21 | Route Library | Upload controls invisible to rider | P0 |
| RP-22 | Member Directory | Affiliated rider views directory | P0 |
| RP-23 | Member Directory | Contact details not visible to rider | P0 |
| RP-24 | Guest Conversion | Ride guest converts to affiliated account | P1 |
| RP-25 | Cross-tenant | Rider cannot see another club's data | P0 |
| RP-26 | Tactical Map | Tactical map components not present | P0 |
| RP-27 | Calendar | Tier 2 rider views calendar when club setting permits | P0 |

---

## 3. BDD Scenarios

### Feature: Access Tiers

---

**Scenario RP-01: Unregistered visitor views club portal**
```
Given a visitor navigates to a club's Rider Portal URL
And they have no Vechelon account and no session cookie
Then they see the club info page with branding applied
And they see Log In and Create Account CTAs
And they do not see the calendar
And they do not see the route library
And they do not see any ride details
And they do not see any member information
```

---

**Scenario RP-02: Ride guest visits portal with session cookie**
```
Given a visitor navigates to a club's Rider Portal URL
And they have a session cookie from a previous QR ride join
Then they see the club info page with branding applied
And they see a "Claim your ride history by creating an account" conversion prompt
And they see Log In and Create Account CTAs
And they do not see the calendar, route library, or member directory
```

---

**Scenario RP-03: Rider pending at manual enrollment club**
```
Given a rider has created an account and verified their email
And they have requested affiliation at a club with enrollment_mode = 'manual'
And the admin has not yet approved
When the rider logs in
Then they see the club info page with branding applied
And they see a "Your membership is pending approval" banner
And they see their profile (editable)
And they see their club status as Pending
And they see Log In / Account access
And they do not see the RSVP button, Route Library, or member directory

If show_calendar_to_pending = false (default):
  And they do not see the calendar or ride details

If show_calendar_to_pending = true:
  And they see the calendar with upcoming rides (read-only)
  And they can click a ride to view ride details (read-only)
  And they do not see the RSVP button on any ride
```

---

**Scenario RP-04: New user creates account at club URL (primary MVP flow)**
```
Given a new visitor navigates to a club's Rider Portal URL
And they do not have an existing Vechelon account
When they click Create Account
Then the account creation flow is presented in the context of that specific club
And on email verification the account affiliation to that club is established:
  - Open enrollment club: rider is immediately Active and Affiliated
  - Manual enrollment club: rider enters Initiated/pending state awaiting admin approval
And the rider lands on the appropriate tier experience for their affiliation state
  Note: The club URL is the entry point. Affiliation is established as part of
  account creation — not as a separate subsequent step for the primary flow.
```

---

**Scenario RP-04b: Existing user adds affiliation with a second club (post-MVP)**
```
Given a rider has an existing Vechelon account affiliated with Club A
When the rider navigates to Club B's Rider Portal URL
Then they can request affiliation with Club B as a separate explicit step
And the outcome follows Club B's enrollment_mode setting
  Note: This is a post-MVP flow. For MVP, Racer Sportif is the only tenant
  and multi-club affiliation is not surfaced in the UI.
```

---

**Scenario RP-05: Affiliated member sees full portal**
```
Given a rider has an Active and Affiliated account
When the rider logs in
Then they see the full navigation — Home, Calendar, Routes, Profile
And they see the calendar with upcoming rides
And they see the RSVP button on eligible rides
And they see the route library with download buttons
And they see the member directory with names only
And they see their profile with edit capability
And they see their club status as Active
And they do not see the My Rides nav item (post-MVP)
```

---

### Feature: Authentication

---

**Scenario RP-06: Email verification required before access**
```
Given a rider has created an account but not yet verified their email
When the rider attempts to log in
Then they are prompted to verify their email first
And they cannot access any portal content beyond the verification prompt
And a resend verification email option is available
```

---

**Scenario RP-07: Admin invite path — email verification grants affiliation**
```
Given an admin has created an account for a rider via invite
And the rider receives an invitation email
When the rider clicks the email link and verifies their email
Then the rider is immediately Active and Affiliated
And no pending state or separate admin approval is required
And the rider lands on the full Tier 3 portal experience
```

---

**Scenario RP-08: Create account / log in accessible at all tiers**
```
Given a visitor is on the Rider Portal at any access tier
Then the Log In and Create Account options are always visible and accessible
And a Tier 2 or Tier 3 rider who logs out can always log back in
And a guest can always initiate account creation from any portal page
```

---

### Feature: Profile

---

**Scenario RP-09: Rider edits profile fields**
```
Given an authenticated rider is on their Profile screen
When the rider updates their name, phone, or emergency contact
Then a Save button becomes visible
When the rider taps Save
Then the changes are written to their account record in Supabase
And a success confirmation is shown
And the Save button disappears until another change is made
```

---

**Scenario RP-10: Rider uploads profile photo**
```
Given an authenticated rider is on their Profile screen
When the rider uploads a photo file
Then the file is validated — max 2MB, image format only
And the image is cropped to square
And the photo is stored in Supabase Storage
And the rider's avatar_url is updated in their account record
And the new photo is displayed immediately
```

---

**Scenario RP-11: Rider profile URL does not expose personal information**
```
Given an authenticated rider has a profile in the Rider Desktop Portal
Then their profile URL uses a UUID identifier — not their name or any plain text personal information
And if a rider attempts to navigate to another rider's profile URL directly
Then they receive a not found or unauthorised response
And no other rider's personal information is displayed
  Note: UUID-based URLs are the established pattern per Admin Portal Rail 1 decisions.
  Plain text name-based URLs are never used for account or profile pages.
```

---

### Feature: Calendar

---

**Scenario RP-12: Affiliated rider views monthly calendar**
```
Given an affiliated rider is on the Calendar screen
Then they see a monthly grid of the current month
And each day with a scheduled ride shows the ride name
And rides the rider has RSVP'd for are visually indicated
And no edit or admin controls are present
And navigation to previous and next months is available
```

---

**Scenario RP-13: Rider clicks ride on calendar**
```
Given an affiliated rider is viewing the calendar
When the rider clicks a ride entry
Then the Ride Detail screen opens for that ride
And the rider sees full ride information
  Note: RSVP state and button behaviour on ride detail is covered by RP-17 and RP-18.
```

---

### Feature: Ride Detail

---

**Scenario RP-14: Rider views ride detail**
```
Given an affiliated rider opens a ride detail
Then they see:
  - Ride name, date, start time
  - Start location with Google Maps link
  - Finish location (if defined)
  - Waypoints with labels (if defined)
  - Pinned route name and Download button (if GPX attached)
  - Captain name
  - SAG name and vehicle description (if assigned)
  - RSVP count
  - RSVP button (if ride is in Created state)
And they do not see contact details for Captain, SAG, or any rider
```

---

**Scenario RP-15: Admin controls invisible to rider**
```
Given an affiliated rider is viewing any Rider Portal screen
Then they do not see an Edit button on any ride
And they do not see a Delete button on any ride
And they do not see a Create Ride button
And they do not see Series management controls
And they do not see Route upload controls
And they do not see role management in the member directory
```

---

**Scenario RP-16: Attendee list visible for participated rides**
```
Given an affiliated rider opens a ride detail for a ride they participated in
Then they see an attendee list showing participant names only
And no contact details are shown in the attendee list
And the attendee list persists after the 4-hour purge
  Note: ride_participants records (names) are retained post-purge.
  Location data is purged. Contact details are not shown to riders.
```

---

### Feature: RSVP

---

**Scenario RP-17: Affiliated rider RSVPs for a ride**
```
Given an affiliated rider is viewing a ride in Created state
And they have not yet RSVP'd
When the rider clicks the RSVP button
Then a ride_participants record is created with status = 'rsvpd'
And the button changes to "Cancel RSVP"
And the RSVP count increments by one
And the rider does NOT appear on the tactical map
  Note: RSVP is intent only. Active requires explicit Join or QR scan on ride day.
```

---

**Scenario RP-18: Affiliated rider cancels RSVP**
```
Given an affiliated rider has RSVP'd for a ride
When the rider clicks Cancel RSVP
Then the ride_participants record is removed
And the button returns to "RSVP"
And the RSVP count decrements by one
```

---

**Scenario RP-19: RSVP not available to Initiated rider**
```
Given an Initiated rider (manual enrollment, pending) is logged in
Then they do not see a RSVP button anywhere in the portal
And no indication that RSVP is possible is shown
```

---

### Feature: Route Library

---

**Scenario RP-20: Affiliated rider browses and downloads routes**
```
Given an affiliated rider is on the Route Library screen
Then they see admin-curated routes for their club only
And each route shows name, distance (if provided), elevation (if provided)
And a Download button is present if a GPX file is attached
And an external route URL link is displayed if provided (e.g. Garmin, Strava, Ride with GPS)
When the rider clicks Download
Then the route file is downloaded from Supabase Storage
When the rider clicks an external URL
Then the link opens in a new browser tab
And no additional authentication step is required for either action
```

---

**Scenario RP-21: Upload controls invisible to rider**
```
Given an affiliated rider is on the Route Library screen
Then they do not see an Upload button
And they do not see Edit or Delete controls on any route
```

---

### Feature: Member Directory

---

**Scenario RP-22: Affiliated rider views directory**
```
Given an affiliated rider navigates to the Member Directory
Then they see a list of Active and Affiliated members for their club
And each entry shows the member's name and profile photo (if uploaded)
And the list is read-only
```

---

**Scenario RP-23: Contact details not visible to rider**
```
Given an affiliated rider is viewing the Member Directory
Then they do not see phone numbers, email addresses, or emergency contacts
And no contact details are visible for any member
```

---

### Feature: Guest Conversion

---

**Scenario RP-24: Ride guest converts to affiliated account**
```
Given a visitor has a session cookie from a previous QR ride join
When the visitor creates a full Vechelon account
Then the standard account creation flow is presented
And email and phone are required
And on email verification the account enters the appropriate state:
  - Open enrollment club: immediately Active and Affiliated
  - Manual enrollment club: Initiated, pending admin approval
And prior ride participation is linked if session cookie match exists
  Note: Cookie matching is best-effort. See Admin Portal Pillar III Scenario 7.
```

---

### Feature: Tactical Map Boundary

---

**Scenario RP-26: Live ride components not present in Rider Desktop Portal (MVP)**
```
Given an affiliated rider is using the Rider Desktop Portal
Then no tactical map is rendered at any point
And no live rider tracking UI is present
And no fleet status bar is present
And no Support Beacon UI is present
And any link to a live active ride directs to the Mobile Tactical App join flow
  Note: Live ride components are mobile-only for MVP. Post-MVP may include
  SAG vehicle and Observer desktop map views — this is roadmap, not a
  permanent architectural exclusion.
```

---

### Feature: Cross-Tenant Security

---

**Scenario RP-25: Rider cannot see another club's data**
```
Given a rider is affiliated with Club A
When they navigate to Club B's Rider Portal URL
Then they see Club B's public club info page only
And they do not see Club B's calendar, rides, or routes
And their Club A session is not transferred to Club B
```

---

### Feature: Calendar — Tier 2 Conditional Access

---

**Scenario RP-27: Tier 2 rider views calendar when club setting permits**
```
Given a rider is in Initiated/pending state at a manual enrollment club
And the club's show_calendar_to_pending setting is true
When the rider logs in
Then they see the Calendar nav item
And they see the monthly calendar grid with upcoming rides
And they can click a ride to view ride details
And they do not see the RSVP button on any ride
And they do not see Route Library or member directory

Given the same rider at the same club
But show_calendar_to_pending is false (default)
Then they do not see the Calendar nav item
And they see only Home and Profile in navigation
```

---

## 4. Critical Test Paths

| # | Critical Path | Why |
|---|---|---|
| CP-RP-01 | Guest sees no member or ride data | Privacy — public URL must not leak club data |
| CP-RP-02 | Initiated (manual) sees pending screen only | Enrollment integrity — access gated correctly |
| CP-RP-03 | Email verification blocks access until complete | Auth integrity |
| CP-RP-04 | Admin invite + email verification = immediate Tier 3 | Correct affiliation path |
| CP-RP-05 | RLS prevents cross-tenant data access | Multi-tenancy security — critical |
| CP-RP-06 | Rider cannot see other riders' contact details | Privacy — phone numbers protected |
| CP-RP-07 | Admin controls invisible — not disabled | UX integrity |
| CP-RP-08 | RSVP does not auto-transition to Active | Tactical map integrity |
| CP-RP-09 | No tactical map component renders in portal | Hard boundary — mobile only |

---

## 5. Device Coverage

| Device | Browser | Priority |
|---|---|---|
| Desktop / laptop | Chrome / Safari | P0 — primary Rider Portal surface |
| iPhone (iOS 16.4+) | Safari | P1 — mobile browser fallback before app |
| Android (mid-range) | Chrome | P1 — mobile browser fallback before app |

---

## 6. Edge Cases for Manual QA

| Scenario | Expected Behaviour |
|---|---|
| Rider RSVPs then club changes to manual enrollment | Existing RSVP persists. Admin must manage manually. |
| Rider tries to RSVP for a ride that is already Active | Button shows "Join" — links to Mobile Tactical App join flow, not in-portal join |
| Rider's account is archived mid-session | Session invalidated. Rider redirected to login. |
| Route file deleted by admin after rider bookmarks detail | Download returns graceful error — file no longer available |
| Rider uploads non-image file as profile photo | Validation error displayed. No file stored. |
| Rider navigates to tactical map URL directly | 404 or redirect — no tactical map component exists in this surface |
| Open enrollment club — rider verifies email | Immediately Tier 3. No pending state shown. |

---

## Change Log

| Version | Date | Time (UTC) | Action | Decision | Lead |
|---|---|---|---|---|---|
| v1.0.0 | 2026-04-11 | 12:00 | ADD | Rider Portal Pillar III initialised — 20 BDD scenarios, 6 critical test paths | TPM |
| v1.1.0 | 2026-04-11 | 13:00 | CHANGE | RP-02 corrected — open enrollment auto-affiliates. RP-03 updated — pending state rider-led manual only. | TPM |
| v1.2.0 | 2026-04-11 | 14:00 | CHANGE | Scenarios renumbered and expanded to 26. Rail terminology replaced. Auth scenarios added (RP-06, RP-07, RP-08). Ride guest scenario added (RP-02). Attendee list scenario added (RP-16). Member directory scenarios added (RP-22, RP-23). Guest conversion scenario added (RP-24). Tactical map boundary scenario added (RP-26). Ride history post-MVP removed from scenarios. Calendar and Route Library corrected to Tier 3 only. CP-RP-09 added. | TPM |
| v1.3.0 | 2026-04-11 | 14:30 | CHANGE | RP-03 updated — conditional calendar access. RP-27 added — Tier 2 calendar access scenario. Index updated. | TPM |
| v1.4.0 | 2026-04-11 | 15:00 | CHANGE | RP-04 replaced — primary MVP flow is club-URL-contextual account creation. RP-04b added as post-MVP second club affiliation. RP-11 updated — UUID for profile URLs per Rail 1 mandate. RP-13 updated — RSVP indicator removed, covered by RP-17. RP-20 updated — external route URL added. RP-26 softened — mobile-only for MVP, post-MVP roadmap noted. | TPM |
