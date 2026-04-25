# Vechelon | Voice & Tone Amendment 001 — Remove Tactical Voice

**Status:** DRAFT — pending Brain ratification
**Date proposed:** 2026-04-25
**Proposed by:** Sr PM (informal session feedback) → captured by The Hands
**Scope:** UX copy across the Admin Portal and Rider Desktop Portal
**Impact:** Brand voice / tone. Not a schema, RLS, or feature change.

---

## Context

The Vechelon UI carries a heavy military / tactical / operations-centre voice — "Tactical Session", "Operator", "Mission Dispatch", "Synchronizing Encrypted Session", "Command Centre", "After-Action Report", etc. Sr PM has flagged that this voice does not serve the product position (a cycling club platform for collaborative, friendly clubs). Proposed direction: replace with **plain, warm, cycling-native language**, keeping a few cycling-appropriate terms that already work (Roster, Captain, Peloton, Beacon).

This amendment proposes a ratified dictionary so that copy changes are made consistently in one sweep, not piecemeal as features are touched.

---

## Why this is a Brain activity

Voice and tone are brand-shaping decisions. Even though the implementation is "find/replace across the codebase," the *choices* embedded in the dictionary affect:

- Brand positioning (serious operations centre vs. friendly club tool)
- Existing Pillar references (Members page status labels — "Validated", "Pending", "Suspended", "Archived" — are tied to status enum semantics defined in Bedrock)
- Terminology that will be carried into future surfaces (Tactical mobile app, AI Ride Summary, multi-tenant onboarding flows)

Per the Trio Protocol, The Hands flag and propose; the Brain ratifies and the ledger records the decision.

---

## Proposed dictionary

### Keep as-is (already cycling-appropriate)
**Roster · Captain · Peloton · Beacon · Sportif · GPX**

### Persona & identity

| Current | Proposed |
|---|---|
| Operator | Rider |
| Operator Identity (Email) | Email address |
| Operator Name | Your name |
| `operator@vechelon.app` placeholder | `rider@example.com` |
| `{N} Operators` | `{N} Riders` |
| Already an operator? | Already have an account? |
| New operators auto-registered | New riders auto-registered |

### Session / ride

| Current | Proposed |
|---|---|
| Tactical Session | Ride |
| Tactical Session Active | Ride in Progress |
| Join Tactical Session / Join Mission | Join Ride |
| End Tactical Session | End Ride |
| Finalizing Tactical Data... | Finalizing ride… |
| Mission / Missions | Ride / Rides |
| Mission Dispatch Sent | Magic link sent |
| Commit RSVP | RSVP |
| Joined tactical session. (toast) | Joined ride. |

### Auth & loading

| Current | Proposed |
|---|---|
| Synchronizing… | Signing in… |
| Synchronizing Encrypted Session... | Signing you in… |
| Initializing Tactical Link | Signing you in |
| Establishing Tactical Link... | Loading… |
| Establishing Link… (join) | Joining… |
| RSVP Synchronized | RSVP Confirmed |
| Authorize Access (CTA) | Send Magic Link |
| Authorize Account to Link History | Sign in to save your ride history |
| Dispatching Link… | Sending… |
| Secure token will expire in 60 minutes | Link expires in 60 minutes |
| A secure tactical link has been dispatched to | A magic link has been sent to |
| Check your comms | Check your email |

### Surfaces & navigation

| Current | Proposed |
|---|---|
| Command Centre (admin nav + page title) | Dashboard |
| Tactical Overview (side sheet header) | Ride Details |
| Tactical Mission Summary (post-ride) | Ride Summary |
| Tactical Session Control (Dashboard section) | Active Rides |
| Live Tactical Intelligence (map section) | Live Map |
| Live Deployment | Live Now |
| View on Tactical HUD (button) | View on Map |
| Tactical Rider Portal | Vechelon Rider Portal (or just Vechelon) |
| Initializing Tactical Builder... | Loading ride builder… |
| Tactical Instructions | Instructions |
| Tactical System Error | Something went wrong |
| SYNCHRONIZING TACTICAL DATA... | Loading… |

### Status & activity

| Current | Proposed |
|---|---|
| Operator Active | You're in (or RSVP Confirmed) |
| Tactical Status: {status} | Status: {status} |
| Pending tactical activation | Pending admin approval |
| Awaiting Tactical Activation | Awaiting admin approval |
| Tactical RSVP access will unlock... | RSVP access will unlock... |
| awaiting command validation | awaiting admin approval |
| AI Intelligence Processing | AI summary pending |
| After-Action Report | Ride Recap |
| Pro-Tour AI summary (mention) | AI recap |

### Long descriptions

| Current | Proposed |
|---|---|
| "Centralized logistics and fleet management. Coordinate routes, group assignments, and safety protocols from a unified tactical view." | "Manage your club's rides, routes, and members from one place." |
| "Tactical command for the {tenant} peloton. Coordinate rides, track your history, and stay mission-ready." | "Welcome back to the {tenant} peloton. Manage your rides and ride history, all in one place." |
| "You've joined tactical sessions as a guest. Create a permanent account to preserve your pings, routes, and club achievements." | "You've joined rides as a guest. Create an account to keep your ride history." |

### Toast & system messages

| Current | Proposed |
|---|---|
| "Tactical unit dispatched to {name}." | "Beacon sent to {name}." |
| "No active tactical sessions detected." | "No active rides." |
| "No active tactical sessions to map" | "No active rides on the map." |

---

## Open questions for the Brain

### Q1 — Members page status labels
The Members page renders these labels for `account_tenants.status`:

| Status enum | Current display label |
|---|---|
| `affiliated` | Validated |
| `initiated` | Pending |
| `suspended` | Suspended |
| `archived` | Archived |

These display labels are cosmetic — they don't change the underlying enum or any RLS / Pillar semantics. The voice question is whether to soften them:

- **Option A — keep as-is.** "Validated / Pending / Suspended / Archived" reads as official, which suits a member-management context.
- **Option B — soften.** e.g., "Approved / Awaiting / Paused / Archived". More cycling-club, less HR.

The Hands' default if not specified: **keep as-is** (Option A). Status labels in a member-management context arguably benefit from the official tone.

### Q2 — Code comments and internal naming
Comments and JSDoc reference "Fleet Heartbeat", "Tactical Real-time Hook", "Rider State Machine", etc. These are not user-visible.

- **Option A — leave alone.** Zero UX benefit, real churn cost.
- **Option B — sweep them too.** Keeps the codebase voice-aligned for future engineers.

The Hands' default if not specified: **leave alone**. Code comments rot quickly anyway; better to write them well next time.

### Q3 — "Operators" usage
The word "operator" appears as both a persona term (a rider) and in functional language ("operator-level role with cross-tenant access" — see Pillar I §5.1, Platform Admin glossary).

- For UX copy targeting end users (riders), replace with "Rider".
- For Pillar / Platform Admin language ("the operator-level role"), the word may still be appropriate at the architectural level. Brain to confirm whether Pillar-level operator language is also retired.

---

## What this amendment does NOT touch

- Schema, RLS, or DB migrations
- Pillar I–IV definitions (only the *display labels* of status enums are surveyed; the enums themselves are untouched)
- Code comments, JSDoc, Zustand slice names, or query keys — unless Q2 is answered "sweep"
- The `productdocuments/` Pillar files — those reflect ratified Brain decisions and would only update if Brain explicitly modifies the Pillars to drop the tactical glossary terms (some Pillars reference "Tactical Overview" framing — out of scope for this amendment)

---

## Implementation plan (once ratified)

When Brain ratifies this dictionary:

1. The Hands sweep all surfaces in one batch — single PR per surface area:
   - `AuthPage.tsx` (auth + magic link)
   - `Dashboard.tsx` + `Layout.tsx` (admin nav, headings, descriptions)
   - `RideLanding.tsx` (rider-facing ride landing)
   - `RideDetailSideSheet.tsx` (side sheet header, copy button labels)
   - `RiderHome.tsx` + `RiderLayout.tsx` (rider dashboard, pending HUD)
   - `EndRideButton.tsx` (action labels, confirm prompt)
   - `ParticipantDetailSheet.tsx` (status row, beacon dispatch toast)
   - `RideBuilder.tsx` (loading + instructions copy)
   - `App.tsx` (error and global loading state)
2. Toasts and placeholders included.
3. Estimated 8–10 files, all string changes, near-zero regression risk.
4. One end-to-end visual QA pass post-sweep.

---

## Change log

| Version | Date | Action | Lead |
|---|---|---|---|
| v0.1.0 | 2026-04-25 | DRAFT | Sr PM + The Hands |
