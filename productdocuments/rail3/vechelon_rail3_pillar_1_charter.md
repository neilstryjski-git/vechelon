[Vechelon Rail 3] Pillar I: The Charter (v1.0.0)
Project: Vechelon Rail 3 — Mobile Tactical | Current Version: v1.0.0 | Last Sync Date: 2026-05-12 | Status: COMMITTED

---

## Change Log
| Version | Date | Time | MACD Action | Decision | Trio Lead |
|---|---|---|---|---|---|
| v0.1.0 | 2026-05-12 | — | ADD | Initialized Rail 3 Pillar I shell | TPM |
| v1.0.0 | 2026-05-12 | — | ADD | Completed all TBD sections. Promoted DRAFT → COMMITTED | TPM |

---

## §1. Mission Statement

Rail 3 is the live ride surface — the third and final surface of Vechelon. Rails 1 and 2 build the ride: the schedule, the route, the roster, the QR. Rail 3 executes it. Reading from the same Supabase backend, Rail 3 activates the moment a ride goes live — live tracking so the Captain and SAG always know where the group is, a one-tap Support Beacon for riders who need help, and ride controls from the saddle. The safety layer that turns a group of cyclists into a coordinated peloton.

This is the differentiator Vechelon exists to deliver.

---

## §2. Problem Statement

Group cycling has no real-time safety layer. When a rider drops off the back, the Captain doesn't know until someone calls it in — or doesn't. When a rider needs help, there's no reliable way to signal position fast. Coordination during a live ride means phone calls, WhatsApp messages, and eyes off the road.

Rails 1 and 2 solve the planning problem. Rail 3 solves what happens on the road — where things go wrong and reaction time matters. Without it, Vechelon is a scheduling tool. With it, it's a safety platform.

---

## §3. Constraints

### Platform Constraints
- Production stack: React Native Expo (managed workflow)
- PoC: React Native Expo, Android only, Expo Development Build (sideloaded APK)
- iOS: Excluded from PoC. Rail 3b post Android validation.
- iOS exclusion rationale: Apple mandates WebKit for all iOS browsers. WebKit does not expose the Geolocation API to Service Workers. Background GPS is impossible in any iOS PWA regardless of browser choice. This is a hard constraint, not a preference.

### Inherited Constraints (by reference — not restated)
- → Rail 1 Pillar I: Supabase architecture, auth, RLS
- → Rail 1 Pillar I: $0 operating cost target
- → Rail 1 Pillar I: 4-hour Hard Purge (applies to all Rail 3 location data)
- → Rail 1 Pillar I: License Bringer AI model
- → Set 3 Pillars: Multi-tenancy — Rail 3 live rides operate within tenant boundary, full RLS isolation maintained

---

## §4. User Personas

→ Base personas inherited by reference from Rail 1 Pillar I.

Rail 3 active personas during a live ride:

| Persona | Role | Rail 3 Capability |
|---|---|---|
| Captain | Leads the ride | Full peloton map, mobile controls, ride management |
| Support | SAG / sweep | Full peloton map, receives beacon alerts |
| Rider | Active participant | Tracked on peloton map, can trigger Support Beacon |

**Krys — The Ride Captain**
Primary device is in their back pocket or jersey — not mounted. Krys is not expected to actively monitor the app during the ride. Rail 3 on Captain is primarily reactive: check the map when something feels off, trigger end ride when done, create an Ad Hoc ride when no scheduled ride exists. The QR code is displayed on Krys's device at ride start — other riders scan it to join.

**Mike — The SAG (Support)**
The active map monitor. Mike is in a vehicle and has eyes on the screen in a way Krys doesn't. Glanceable UI is non-negotiable — large icons, readable at a distance. Mike receives Support Beacon alerts and can cancel them. Mike cannot end a ride.

**Paddy / Slim Shadey — Rider / Guest Rider**
Minimal interaction during the ride. Joins via QR scan or in-app Join. Sees their own position as a blue dot and the Captain and SAG icons only. Primary action available: trigger Support Beacon. Everything else is passive — they are being tracked, not managing.

---

## §5. Domain Glossary Additions (Rail 3)

→ Base glossary inherited by reference from Rail 1 Pillar I.

| Term | Definition |
|---|---|
| Live Map | The real-time map showing all active rider positions during a ride |
| Support Beacon | One-tap distress signal sent by a rider, alerting Captain and Support with location snapshot |
| Rider State | The tactical condition of a ride participant as determined by movement and connectivity signals. One of: Active, Stopped, Inactive, or Dark. Drives icon rendering on the live map |
| Edge Indicator | A directional arrow rendered at the boundary of the visible map viewport, pointing toward the ride's finish point when the finish is outside the current view. Calculated using the Haversine formula. No routing engine required |
| Background GPS | GPS tracking that continues when a device screen is locked |
| Expo Development Build | Custom native APK with full capabilities, distributed via sideload — PoC only |
| Supabase Broadcast | Ephemeral WebSocket channel — no database write — used for real-time location fan-out |
| OEM Battery Optimisation | Aggressive background process killing on Samsung, Xiaomi, Huawei devices outside Google's standard |

---

## §6. C1 System Context Diagram

```mermaid
%% v1.0.0
C4Context
    title Vechelon Rail 3 — Mobile Tactical App — System Context

    Person(captain, "Captain (Krys)", "Leads the ride. Creates Ad Hoc rides, monitors live map reactively, ends ride, cancels beacons.")
    Person(sag, "SAG / Support (Mike)", "Active map monitor. Vehicle-based. Receives beacon alerts, cancels beacons.")
    Person(rider, "Rider / Guest", "Joins via QR or in-app. Tracked on live map. Can trigger Support Beacon.")

    System(rail3, "Vechelon Rail 3", "Mobile Tactical App. Live map, Support Beacon, Captain controls. Android-first.")

    System_Ext(supabase, "Supabase", "Shared backend — Auth, Realtime Broadcast, PostgreSQL, Edge Functions. Ride data created in Rails 1 and 2 consumed here.")
    System_Ext(googlemaps, "Google Maps API", "Map tile rendering.")
    System_Ext(dialler, "Native Phone Dialler", "Safety communication via tel: link.")

    Rel(captain, rail3, "Monitors map, manages ride, creates Ad Hoc rides")
    Rel(sag, rail3, "Monitors map, manages beacons")
    Rel(rider, rail3, "Joins ride, tracked, triggers beacon")
    Rel(rail3, supabase, "Auth, location broadcast, ride data, Hard Purge cron")
    Rel(rail3, googlemaps, "Renders live map")
    Rel(rail3, dialler, "Opens native dialler via tel: link")
```
