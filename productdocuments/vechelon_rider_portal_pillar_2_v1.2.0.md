# Vechelon | Rider Desktop Portal | Pillar II: The Specs (v1.4.0)

Project: Vechelon — Rider Desktop Portal | Current Version: v1.4.0 | Last Sync Date: 2026-04-11 | Status: COMMITTED

---

## Reference

Schema, auth, backend, branding injection, and tenant architecture are defined in **Admin Portal Pillar II: The Specs (v1.3.0)**. This document covers only the Rider Desktop Portal surface layer — screens, UX, and component specifications.

The Rider Desktop Portal is a **subset of the Admin Portal** using the same React component library with role-based rendering. No new component types are introduced — admin controls are hidden for riders, not disabled.

---

## 1. Technology Stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | React (Web) | Same stack and component library as Admin Portal. Shared codebase. |
| Backend | Supabase | Shared with Admin Portal. See schema notes below. |
| Auth | Supabase Auth | Magic Link + email verification. Standard password recovery. Same as Admin Portal. |
| Branding | CSS custom properties | Same tenant injection model as Admin Portal. |

**Desktop-first. Responsive for mobile browser — not optimised for it.** The Mobile Tactical App serves the mobile-optimised experience.

**No live ride components for MVP.** The tactical map, fleet tracking, and Support Beacon UI are mobile-only for MVP. Post-MVP roadmap may include SAG/Observer desktop map view — this is not a permanent architectural exclusion.

---

## 2. Schema Notes

### account_tenants (New — replaces single tenant_id on accounts)

The Admin Portal `accounts` table carries a single `tenant_id` field. To support multi-membership, this is replaced by a junction table. Zero MVP impact — Racer Sportif is the only tenant, every rider has one record.

**This is a known schema extension to the Admin Portal.** The Hands should flag this as a Pillar V Amendment when implementing — the Admin Portal schema is COMMITTED and this change extends it.

| Field | Type | Notes |
|---|---|---|
| account_id | UUID FK → accounts | |
| tenant_id | UUID FK → tenants | |
| status | Enum | 'initiated' / 'affiliated' / 'archived' |
| role | Enum | 'admin' / 'member' / 'guest' |
| joined_at | Timestamp | When affiliation was confirmed |

**Additional field on tenants table:**

| Field | Type | Notes |
|---|---|---|
| show_calendar_to_pending | Boolean | Default: false. When true, Tier 2 (Initiated) riders at manual enrollment clubs can view the calendar and ride details. RSVP, Route Library, and Member Directory remain Tier 3 only. |

### Admin Portal tables used by Rider Desktop Portal

| Table | Rider Portal Usage |
|---|---|
| accounts | Profile read/write for own record only |
| account_tenants | Affiliation status and role per club |
| rides | Read-only — scheduled rides for calendar and detail |
| ride_participants | Read/write — own RSVP. Read — attendee list on participated ride detail. |
| route_library | Read-only — browse and download |
| tenants | Read-only — club info, branding config |
| ride_support | Read-only — SAG info on ride detail |

**RLS rules for Rider Desktop Portal:**
- Riders read and update their own account record only
- Riders read account_tenants for their own account_id only
- Riders read rides within tenants they are associated with
- Riders read route_library records within their associated tenants
- Riders read ride_participants — own records for RSVP, and names-only attendee list for rides they participated in
- Riders cannot read other accounts' records or contact details
- Riders cannot write to rides, route_library, or ride_support

---

## 3. Navigation Structure

Admin-only items are never shown to riders — not disabled, invisible.

**Tier 3 (Affiliated):**
```
[Club Logo] [Club Name]
Home | Calendar | Routes | Profile
[Log In / Account — always accessible]
```

**Tier 2 (Initiated — manual enrollment only):**
```
[Club Logo] [Club Name]
Home | Profile                          (default)
Home | Calendar | Profile               (if show_calendar_to_pending = true)
[Log In / Account — always accessible]
```

**Tier 1 (Guest):**
```
[Club Logo] [Club Name]
Home | Log In | Create Account
```

**Note:** "My Rides" is removed from navigation — ride history on profile is post-MVP. Attendee list on ride detail is MVP.

---

## 4. Screen Specifications

### 4.1 Club Info Page (Home — all tiers)

The landing page for the club's Rider Portal URL. Visible to all visitors.

**Content:**
- Club logo and name (branding applied immediately regardless of affiliation)
- Club description
- Contact information
- For Tier 1: prominent Log In and Create Account CTAs
- For Tier 1 ride guests: "Claim your ride history by creating an account" conversion prompt
- For Tier 2 (manual enrollment): "Your membership is pending approval" banner
- For Tier 3: upcoming rides teaser (next 1–2 rides with RSVP button)

---

### 4.2 Profile (Tier 2 and 3)

The rider's personal record. Own record only — riders cannot view other riders' profiles.

**Editable fields:**
- Profile photo (upload — square crop, max 2MB, Supabase Storage)
- Full name
- Email
- Phone number
- Emergency contact name
- Emergency contact phone

**Read-only fields:**
- Account status (Initiated / Active & Affiliated)
- Club affiliation date (when affiliated)
- Role (Member / Captain / Guest)

**UX notes:**
- Single page, no tabs
- Save button appears only when a field has been changed
- All fields validated on save — email requires @ and domain, phone requires country code and 10 digits
- Ride history section on profile: **post-MVP**

---

### 4.3 Club Status (Tier 2 and 3)

Inline on the Profile page or as a distinct card.

**Content:**
- Affiliation status badge (Pending / Active)
- Club name and logo
- Join date (when affiliated)
- Role (Member / Captain)
- For Tier 2 manual enrollment: what pending means and what happens next

---

### 4.4 Calendar (Tier 3, and Tier 2 when show_calendar_to_pending is enabled)

Full monthly calendar grid. Read-only. Same data as Admin Portal calendar — different rendering, no edit controls.

**Access:** Tier 3 always. Tier 2 only when the club's `show_calendar_to_pending` setting is true. Seeded at DB level for MVP — Racer Sportif default is false.

**Behaviour:**
- Monthly grid view
- Each day cell shows ride name if a ride is scheduled
- Clicking a ride opens the Ride Detail screen
- Previous / next month navigation
- Current day highlighted
- Rides rider has RSVP'd for are visually indicated

**Riders do not see:**
- Edit controls
- Admin management actions
- Rides in a different tenant

---

### 4.5 Ride Detail (Tier 3, and Tier 2 when show_calendar_to_pending is enabled)

Full detail view for a single ride. Read-only. Same component as Admin Portal — admin controls hidden, not disabled.

**Access:** Tier 3 always. Tier 2 only when the club's `show_calendar_to_pending` setting is true. RSVP button not shown to Tier 2 riders regardless of this setting.

**Content:**
- Ride name
- Date and start time
- Start location (with Google Maps link)
- Finish location (if defined)
- Waypoints with optional labels (e.g. "Coffee", "Lunch")
- Pinned route file name and Download button (if GPX attached)
- External route URL link (if provided — e.g. Garmin, Strava, Ride with GPS) — opens in new tab
- Captain name
- SAG name and vehicle description (if assigned)
- RSVP count
- RSVP button (state-aware — see Section 4.6)
- Attendee list (names only) — visible if the rider participated in this ride

**Riders do not see:**
- Edit, delete, or series management controls
- Other riders' contact details
- Their own contact details in the attendee list context

---

### 4.6 RSVP (Tier 3 only)

Single state-aware button on Ride Detail and Calendar.

| Ride State | Button |
|---|---|
| Created | RSVP |
| Rider has RSVP'd | Cancel RSVP |
| Active | Join (links to Mobile Tactical App join flow) |
| Saved (completed) | No button |

**Behaviour:**
- RSVP creates a ride_participants record with status = 'rsvpd'
- Cancel RSVP removes the record
- RSVP does NOT auto-transition to Active on ride start — consistent with Admin Portal Pillar II

---

### 4.7 Route Library (Tier 3 only)

Browse and download admin-curated official routes. Same data as Admin Portal Route Library — no upload or management controls.

**Content per route card:**
- Route name
- Distance (km) — if provided
- Elevation gain (m) — if provided
- Download button — if GPX file attached
- External route URL link — if provided (e.g. Garmin, Strava, Ride with GPS), opens in new tab

**Behaviour:**
- Download triggers file download from Supabase Storage
- No upload, edit, or delete controls visible to riders
- Routes filtered by tenant — riders see their club's routes only

---

### 4.8 Member Directory (Tier 3 only)

Read-only list of club members. Same data as Admin Portal member directory — contact details hidden.

**Content:**
- Member names — visible to all affiliated members
- Profile photo (if uploaded)

**Riders do not see:**
- Contact details (phone, email, emergency contact)
- Role management controls
- Any members from a different tenant

---

### 4.9 Post-MVP Screens

| Screen | Notes |
|---|---|
| Ride history on profile | Chronological list of rides the rider participated in. Requires ride_participants historical query. |
| Club switcher | Dropdown or selector for riders belonging to multiple clubs. Requires account_tenants UI. |

---

## 5. UX Principles

These supplement the Admin Portal UX principles.

| Principle | Rule |
|---|---|
| Subset rendering | Rider Portal uses the same components as Admin Portal. Role-based rendering hides admin controls — never disables them. |
| No tactical map | The tactical map does not exist in the Rider Desktop Portal. Any link to a live ride joins via the Mobile Tactical App. |
| Desktop-first | Designed for desktop. Responsive for mobile browser as fallback. Not optimised for mobile. |
| Admin actions invisible | If a rider cannot perform an action, the control is not rendered. |
| One primary action per screen | RSVP. Download. Save profile. One clear CTA. |
| Tier adapts the experience | Same URL, same codebase. Portal detects account state and adapts navigation and content. |

---

## 6. Sprint 0 Tasks (Rider Desktop Portal specific)

These supplement the Admin Portal Sprint 0 task list.

| # | Task | Context |
|---|---|---|
| RP-S0-01 | RLS policy extension | Rider read access to rides, route_library, own account, attendee names on participated rides. Confirm cross-tenant isolation. |
| RP-S0-02 | Profile photo upload | Supabase Storage bucket config. Max 2MB, image validation, square crop. |
| RP-S0-03 | Tier detection logic | Account state detection on portal load — Guest (no account), Guest (ride cookie), Initiated (manual), Affiliated. Navigation adapts per tier. |
| RP-S0-04 | RSVP state management | ride_participants read/write for own records. Test RSVP create and cancel. Confirm no auto-transition to Active. |
| RP-S0-05 | Calendar library selection | React calendar library for monthly grid. Ride event rendering and click-through to ride detail. |
| RP-S0-06 | account_tenants Pillar V Amendment | The Hands to submit a Pillar V Amendment for the account_tenants schema extension — Admin Portal schema is COMMITTED. |
| RP-S0-07 | Shared component library validation | Confirm Admin Portal components can be reused in Rider Portal with role-based rendering. Identify any components that require a rider-specific variant. |

---

## Change Log

| Version | Date | Time (UTC) | Action | Decision | Lead |
|---|---|---|---|---|---|
| v1.0.0 | 2026-04-11 | 12:00 | ADD | Rider Portal Pillar II initialised | TPM |
| v1.1.0 | 2026-04-11 | 13:00 | CHANGE | account_tenants junction table added. Tier 2 open enrollment nav removed. | TPM |
| v1.2.0 | 2026-04-11 | 14:00 | CHANGE | Rail terminology replaced. Rider Portal characterised as Admin Portal subset — shared components, role-based rendering. Auth updated — email verification required all paths, standard patterns noted. Tactical map hard boundary stated. Desktop-first framing. Guest ride guest expanded with conversion prompt. Create account/login at all tiers. Ride history post-MVP — attendee list on ride detail MVP. Member directory added Tier 3 read-only. Calendar and Route Library corrected to Tier 3 only (not Tier 2). My Rides removed from nav. RP-S0-06 and RP-S0-07 added. | TPM |
| v1.3.0 | 2026-04-11 | 14:30 | CHANGE | show_calendar_to_pending field added to tenants. Calendar and Ride Detail available to Tier 2 when setting enabled. Navigation updated for conditional Tier 2 calendar access. | TPM |
| v1.4.0 | 2026-04-11 | 15:00 | CHANGE | Live ride components reframed — mobile-only for MVP, not permanent exclusion. External route URL added to Ride Detail and Route Library specs. Account creation flow updated — club-URL-contextual as primary MVP path. | TPM |
