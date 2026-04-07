# Vechelon | Pillar I: The Charter (v1.0.0)

Project: Vechelon | Current Version: v1.0.0 | Last Sync Date: 2026-04-06 | Status: DRAFT

---

## 1. Mission Statement

Vechelon transforms the group ride from a series of individual GPS tracks into a unified tactical unit. It is a Tactical Command Centre — not a social fitness network — that operates exclusively in the 2–6 hour window when coordination and safety are the only things that matter.

Vechelon wins by owning the Live Ride. Strava and Garmin have already won social validation and performance archiving. Vechelon wins by ensuring no rider is left behind, lost, or uncontactable during the ride itself.

**Tagline:** Club Command

---

## 2. The North Star Constraints

These are hard constraints. Any feature that violates them is killed before documentation.

| Constraint | Rule |
|---|---|
| $0 Operating Cost | The platform must run on free-tier infrastructure for a single active club MVP. Paid services require explicit PM approval and Ledger entry. |
| Zero-Friction Participation | Guests must be able to join a live ride without a prior account, app download, or email verification. |
| Privacy as Product | All location data and guest session data are purged 4 hours after ride close. This is non-negotiable. |
| Tactical Focus | Vechelon covers the Live Ride only. Pre-ride planning and post-ride performance archiving are deliberately out of scope. |
| No In-App Communication | All voice and text coordination uses the rider's native phone dialler and WhatsApp. Vechelon surfaces contact details; it does not carry messages. |

---

## 3. The Problem Statement

Cycling clubs operate across three fragmented tools:

- **Strava** — performance tracking and social validation, but no tactical live awareness
- **WhatsApp** — real-time communication, but ephemeral and noisy; critical information gets buried
- **Nothing** — live group safety, fleet visibility, and support van coordination have no dedicated tooling

The result: Ride Captains cannot see their fleet. Support vans cannot locate dropped riders efficiently. Guests join rides with no safety net. Important club information disappears into WhatsApp scroll.

Vechelon closes the tactical gap — the period when the ride is active and every decision is time-critical.

---

## 4. The Five Outcome Pillars

These are Vechelon's core value propositions, derived from real club pain points.

| # | Problem | Vechelon Response | Outcome |
|---|---|---|---|
| 01 | Planning — newer riders are unfamiliar with the course | Admin pins an official GPX route; start/finish and waypoints are broadcast to all riders | Consistent group rides with shared spatial awareness |
| 02 | Rollout — pace differences fragment the group instantly | Single-tap join keeps every rider on the tactical roster regardless of speed | Unified group presence from the first pedal stroke |
| 03 | The Ride — high-speed pace changes make group position impossible to gauge | Real-time state mapping: Active, Stopped (5-min), Inactive (15-min) | Relative positioning maintained even in mass-participation events |
| 04 | Support — vans cannot efficiently locate dropped or distressed riders | Real-time tactical icons; Support Beacon toggle; one-tap native dial | Rapid, targeted assistance with precise situational mapping |
| 05 | Aftermath — long-term GPS storage creates privacy risk | Automated purge of all tactical data 4 hours post-ride | Zero-Footprint Safety — club history preserved, sensitive tracks erased |

---

## 5. User Personas

### 5.1 Fab — The Club Admin
- **Who:** The primary organiser for the club. Manages ride creation, series scheduling, and club membership. May or may not ride.
- **Device context:** Desktop for ride creation and series management. Mobile during live rides.
- **Core needs:** Create and manage rides efficiently. Push ride info to WhatsApp. Monitor live fleet during events.
- **Veto power:** Mission Veto — kills anything that adds administrative friction or scope creep.

### 5.2 The Ride Captain
- **Who:** An elevated Member assigned to a specific ride. Responsible for group cohesion and safety during the live ride.
- **Device context:** Mobile, often phone mounted on handlebars. May use a secondary device for calls.
- **Core needs:** Fleet visibility. Instant access to all rider contact details. Ability to identify and respond to Inactive or Beaconing riders.
- **Special authority:** Can create Ad Hoc rides. Can end a ride. Can cancel a rider's Support Beacon.

### 5.3 The Support Van (SAG)
- **Who:** A designated support person, typically in a vehicle, assigned to a specific ride. May be a separate person from the Captain.
- **Device context:** Mobile or tablet. Hands-free context — UI must be readable at a glance.
- **Core needs:** Global fleet visibility. Always visible to all active riders as a Primary Beacon. Rapid contact with any rider.
- **Special authority:** Always visible to all riders regardless of position. Can cancel a rider's Support Beacon.
- **MVP constraint:** One support person per ride. Multiple support is post-MVP.

### 5.4 The Member Rider
- **Who:** A verified club member with an Active & Affiliated account.
- **Device context:** Mobile during rides. May use a dedicated cycling computer (Garmin, Wahoo) for navigation — Vechelon is the safety layer, not the nav tool.
- **Core needs:** RSVP to rides. Join active rides. See Captain and Support Van position and contact details. Trigger Support Beacon if needed.
- **Visibility:** Can see Captain and Support Van only — not other riders' positions.

### 5.5 The Guest Rider
- **Who:** An unverified participant who joins via QR code at the parking lot. May provide optional name and phone number.
- **Device context:** Mobile. Often a first-time experience with Vechelon.
- **Core needs:** Zero-friction ride entry. Appear on Captain's map immediately. Access to Captain and Support Van contact details.
- **Visibility:** Same as Member Rider — Captain and Support Van only.
- **Account path:** Guest account persists post-ride. Can be converted to full Member at any time. Ride history carries forward if cookie match exists.

### 5.6 The Observer (Post-MVP)
- **Who:** A non-riding participant — family member, team manager — who monitors the live map without participating.
- **Status:** Deliberately deferred. Not in MVP scope.

---

## 6. Domain Glossary

| Term | Definition |
|---|---|
| Active Ride | The period between a ride going Active and being closed by Admin/Captain or midnight UTC auto-close |
| Support Beacon | A lightweight rider-triggered visual SOS that changes the rider's map icon to a pulsing high-visibility state on Captain and Support Van views |
| Hard Purge | The automated deletion of all location data and guest session data exactly 4 hours after a ride is closed |
| Zero-Footprint Safety | The privacy outcome of the Hard Purge — sensitive GPS tracks erased, club history (summary, participant count) preserved |
| Fleet Heartbeat | The real-time collection of active rider pings visible to Captain and Support Van |
| Tactical Directory | How Vechelon surfaces contact info — it shows the number and provides a dial button; all communication happens outside the app |
| Guest [ID] | An anonymous guest rider who has not provided name or phone — visible on the Captain's map as a tracked but unidentified unit |
| Shadow Account | A lightweight browser-cookie-based guest record that persists post-ride and can be converted to a full Member account |
| Halo State | A rider who has been stationary for 2–5 minutes — Stopped state; visible prompt for Captain awareness |
| Fade State | A rider who has been stationary for 5–15 minutes — Inactive state; human-judgement prompt for Captain or Support Van |
| Series | A set of recurring ride instances linked by a series_id UUID, each an independent database record |
| Route Library | The admin-curated collection of official GPX routes associated with a club tenant |
| Home Base | The non-live-ride surface of the app: calendar, Route Library, member directory, ride history, club info |
| The Hands | The coding agent (Claude Code, Gemini CLI, or human developer) who builds from the Bedrock |
| Tenant | A single club instance on the Vechelon platform. MVP = one active tenant (Racer Sportif) |
| Bedrock | The committed documentation set (Pillars I–IV) that The Hands build from |

---

## 7. Key Deliverables (MVP Scope)

| Deliverable | Description | Phase |
|---|---|---|
| Live Tactical Map | Real-time fleet visibility for Captain and Support Van. State-aware rider icons. | MVP |
| Guest QR Join | Zero-friction ride entry via QR scan. No account required. | MVP |
| Member Join / RSVP | In-app join button. State-aware: "RSVP" pre-ride, "Join" when Active. | MVP |
| Support Beacon | Rider-triggered visual SOS. Cancellable by Rider, Captain, or Support Van. | MVP |
| Ride Series Creator | Admin/Captain bulk-creates recurring ride schedules. | MVP |
| Ad Hoc Ride Creation | Captain/Admin creates an unscheduled ride in the parking lot. | MVP |
| WhatsApp Bridge (Outbound) | AI-generated pre-ride and post-ride summaries; Copy to Clipboard for WhatsApp paste. | MVP |
| Route Library | Admin-curated GPX upload, browsable by all members. | MVP |
| Hard Purge | Automated 4-hour post-ride deletion of location and guest session data. | MVP |
| Home Base | Club calendar, member directory, personal ride history, club info page. | MVP |
| Multi-Tenancy Foundation | Single codebase, per-tenant branding via CSS variables. MVP = one active tenant. | MVP |
| Native Mobile App | React Native / Expo cross-platform build. Background GPS reliability. | Post-MVP |
| Observer Role | Non-riding map monitor for family members, team managers. | Post-MVP |
| Multiple Simultaneous Rides | More than one active ride per club at a time. | Post-MVP |
| In-App Notifications | Email / push notification system. | Post-MVP |
| Self-Serve Admin Branding Portal | Non-technical club admin configures logo, colours, slug. | Post-MVP |
| Geofencing | Join restrictions based on proximity to route. | Post-MVP |
| WhatsApp Deep-Link Sharing | Direct link from WhatsApp into active ride join flow. | Post-MVP |
| Strava Integration | Individual activity sync, personal progress dashboards. | Post-MVP |

---

## 8. System Context Diagram (C1)

```mermaid
C4Context
  title Vechelon — System Context (C1) v1.0.0

  Person(admin, "Club Admin (Fab)", "Creates rides, manages series, monitors fleet")
  Person(captain, "Ride Captain", "Leads ride, monitors fleet, contacts riders")
  Person(support, "Support Van", "Vehicle support, global beacon, contacts riders")
  Person(member, "Member Rider", "Verified club member, joins rides")
  Person(guest, "Guest Rider", "Joins via QR, optional identity")

  System(vechelon, "Vechelon", "Tactical Command Centre for live group rides")

  System_Ext(googlemaps, "Google Maps API", "Map rendering and admin geocoding")
  System_Ext(openmeteo, "Open-Meteo API", "Free weather data for post-ride summary")
  System_Ext(gemini, "Gemini API (Admin Key)", "AI ride summary generation and GPX derivation")
  System_Ext(whatsapp, "WhatsApp", "External club communication channel")
  System_Ext(strava, "Strava", "Rider's personal activity tracking (separate)")

  Rel(admin, vechelon, "Creates rides, manages club, views fleet")
  Rel(captain, vechelon, "Monitors fleet, contacts riders, ends rides")
  Rel(support, vechelon, "Global beacon, contacts riders")
  Rel(member, vechelon, "RSVPs, joins rides, triggers beacon")
  Rel(guest, vechelon, "Joins via QR, optional name/phone")

  Rel(vechelon, googlemaps, "Map rendering, geocoding")
  Rel(vechelon, openmeteo, "Weather at ride close")
  Rel(vechelon, gemini, "AI summary and GPX derivation")
  Rel(admin, whatsapp, "Pastes ride summary manually")
  Rel(member, strava, "Personal activity tracking (external)")
```

---

## 9. Non-Functional Requirements

| Requirement | Rule |
|---|---|
| Mobile-First | All rider-facing UI must be fully functional on a mobile browser. PWA — no app store required. |
| Thumb-Friendly | Tactical UI elements must be operable with one thumb. Bottom Sheet pattern for contact/detail views. |
| Zero App Download | Guests join via browser URL. No install required for ride participation. |
| Privacy by Design | Location and PII collected only for ride safety. Purged automatically. No permanent GPS archive. |
| $0 Infrastructure | Free-tier Supabase, Google Maps ($200/month credit), Open-Meteo (free). Cost escape valve: OSM + Leaflet if Google Maps credit exceeded. |
| Google Maps Billing Alert | Hard operational rule: $150 billing alert configured in Google Cloud Console. |
| Single Active Ride | MVP supports one active ride per club at a time. |
| Auth Pattern | LLD decision for The Hands — recommendation: Supabase Magic Link. |

---

## 10. Test Club — Tenant 1

**Club Name:** Racer Sportif
**Founded:** 1978, Toronto, Ontario
**Locations:** 2214 Bloor St W, Toronto / 151 Robinson St, Oakville
**Disciplines:** Road, Gravel, Track, Triathlon
**Community:** Organised club rides, youth development, charity events
**Brand assets:** To be seeded manually by The Hands at initialisation. Reference: vechelon.productdelivered.ca for Vechelon platform brand. Racer Sportif brand assets provided by club admin.

---

## Change Log

| Version | Date | Time (UTC) | Action | Decision | Lead |
|---|---|---|---|---|---|
| v1.0.0 | 2026-04-06 | 00:00 | ADD | Pillar I initialised from Phase 0 inventory and gap interview | TPM |
