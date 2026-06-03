# Vechelon Rail 2 — iOS Defect Summary
**Date:** 2026-05-16
**Surface:** Rail 2 — Rider Portal (Guest / Broadcast Link View)
**Status:** Under Investigation — handed to The Hands

---

## Incident Summary

A tester on an iPhone 11 (iOS 18.3.2) clicked a Vechelon broadcast link — the guest view of the Rider Portal distributed via WhatsApp — and the app did not successfully load. The screen was stuck in the loading state indefinitely.

---

## Device Details

| Field | Value |
|---|---|
| Device | iPhone 11 |
| iOS Version | 18.3.2 |
| Model Number | MWLJ2VC/A |
| Capacity | 128 GB |
| Coverage | Expired (cellular inactive) |

---

## Diagnostic Findings

**Connectivity confirmed:** The Vechelon loading screen was visible, which confirms the React bundle was delivered by Vercel and initialized successfully. The device had sufficient connectivity to reach the server.

**Nature of the hang:** The failure is not in the initial page load. The React app mounted and rendered the loading state. The hang occurred in a subsequent data fetch fired after mount — the app was waiting on an API response that never resolved or returned an error.

**Server-side logs:** Because the loading screen rendered and a downstream API call was made, Vercel function logs should contain a record of the request. The log entry will show one of: a non-200 response, a timeout, or a malformed request. The presence or absence of the log entry is itself diagnostic.

---

## Leading Hypotheses

1. **API call on mount with no timeout or fallback** — the guest view fires a data fetch that never resolves, and the loading state never clears. Safari is stricter than Chrome about certain network behaviours.
2. **CORS header gap** — the API request reaches the server but Safari blocks the response due to a missing or misconfigured header. Chrome is more permissive and may have masked this issue during earlier testing.
3. **Service Worker interference** — if any PWA scaffolding exists in the build, iOS Safari handles service worker lifecycle differently and can stall post-mount initialization.

---

## Recommended Investigation Path (For The Hands)

1. Check Vercel function logs for the timestamp of the failed session — identify which API call fired and what response (if any) was returned.
2. Reproduce on iOS Safari with DevTools connected via Mac (Safari > Develop menu).
3. Inspect the Network tab for any hanging or failed requests after the loading screen renders.
4. Confirm CORS headers are correctly set on the guest/broadcast endpoint.

---

## Escalation Trigger

If the root cause requires an architectural change — e.g., a CORS policy change at the API layer, a change to the guest auth flow, or a structural change to how the guest view hydrates data — The Hands must trigger the Amendment Protocol and bring it back to the Trio before proceeding.

---

## Important Context

Other iPhones were successfully loading Vechelon at the same time this failure occurred. This rules out a blanket iOS Safari compatibility issue and points to something specific to this device or this particular session — likely the expired cellular coverage combined with an unstable or marginal WiFi connection at the time of the attempt, rather than a code-level defect.

---

## Notes

- This defect was not flagged during earlier UAT, likely because prior testing was conducted on Android Chrome, which is more permissive on CORS and network behaviours.
- The broadcast link guest view is a high-visibility conversion surface — the first touchpoint for prospective riders arriving from WhatsApp outreach. iOS Safari compatibility on this path is non-negotiable for production.
- This defect does not affect the Rail 3 PWA PoC rationale. The PWA PoC is scoped to Android Chrome only; iOS PWA limitations are a known and documented architectural constraint.
