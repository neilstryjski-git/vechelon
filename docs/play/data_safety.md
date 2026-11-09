# Google Play — Data Safety answers (location and retention), D100 → W224

Play Console → Policy → App content → Data safety. This covers the location and retention
answers decided on 2026-11-09 (D100, option C) so W224 can enter them. It is checked against
`privacy.html` §4/§7 and the `rail3_retention_purge()` job.

## Data collected

| Data type | Collected | Shared with third parties | Optional | Purpose |
|-|-|-|-|-|
| Precise location | Yes | No (Supabase, Transistorsoft and Google Maps are processors, not sharing) | Required to take part in a live ride; the app works without it outside rides | App functionality (live group ride map, safety) |
| Approximate location | Not separately (precise covers it) | — | — | — |
| Email address | Yes | No | Required (sign-in) | Account management |
| Name (display name) | Yes | No | Required | App functionality |
| Phone number | Yes (optional on the account; a copy is held per ride for the organiser and deleted within 5 hours of the ride ending) | No | Optional | App functionality (contacting a rider during a ride) |
| App activity / diagnostics | Yes (ride telemetry: cadence, state, latency — no coordinates) | No | Required | Analytics, app functionality |

- **Background location:** used only during an active ride, after an in-app explanation and consent.
- **Processed ephemerally?** Location: **No**. Live positions are broadcast, but three points are kept
  for a limited time (below), so do not tick "processed ephemerally".
- **Encrypted in transit:** Yes.
- **Users can request deletion:** Yes, in the app and at vechelon.productdelivered.ca/delete-account.

## Retention (what the policy and the job actually do)

| Point | Why it's kept | Deleted |
|-|-|-|
| Rider's last known position | So the Captain can find a rider whose phone goes quiet | Within 5 hours of the ride ending |
| Beacon location | So the club can follow up a call for help | Coordinates cleared after 30 days; the alert record stays |
| Ride leader's route | So the group can follow the route | Within 5 hours of the ride ending (4 hours after its last update) |
| Rides never ended | — | Closed automatically 24 hours after they started, then the rules above apply |

The job runs every 30 minutes, which is why the policy says "within 5 hours" rather than 4.
The per-ride phone copy is deleted with the last position (Sr PM, 2026-11-09); the profile phone is kept while the account exists.
