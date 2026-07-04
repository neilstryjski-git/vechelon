# Rail 3 load-test harness (W180)

Synthetic-fleet load test for Rail 3 Supabase Broadcast. Model **C**: fake riders are
**real rows in the real render pipeline** (seeded `ride_participants` on a throwaway
ride), each one both **broadcasting** its position over REST (the exact path the mobile
app uses) **and subscribing** over a websocket — so we reproduce the O(N²) delivery
fan-out W193 flagged (`delivery = sends × connected subscribers`), not just sends.

**Staging only.** Never point this at production. Everything it creates is tagged
(`LOADTEST <runTag>` ride, `loadtest+<runTag>-…` accounts) and removed by `teardown`.

## Setup

```sh
cd loadtest
npm install
cp .env.example .env   # then fill in the three values
```

`.env`:

```
STAGING_URL=https://xybgtbybdhxuwqjfcfkc.supabase.co
STAGING_ANON_KEY=<staging anon/publishable key>
LOADTEST_SECRET=<same value set as the LOADTEST_SECRET function secret>
```

The two edge functions (`loadtest-seed`, `loadtest-teardown`) must be deployed to
staging and the `LOADTEST_SECRET` secret set:

```sh
npx supabase functions deploy loadtest-seed     --project-ref xybgtbybdhxuwqjfcfkc
npx supabase functions deploy loadtest-teardown --project-ref xybgtbybdhxuwqjfcfkc
npx supabase secrets set LOADTEST_SECRET=<secret> --project-ref xybgtbybdhxuwqjfcfkc
```

## Use

```sh
# full lifecycle: seed → 5-min run → teardown, default 2 captains / 2 support / 16 riders
node loadtest.mjs all

# or step by step, tuning the fleet and run:
node loadtest.mjs seed --captains 2 --sag 2 --riders 16
node loadtest.mjs run  --duration 300 --interval 3000
node loadtest.mjs teardown
```

Flags: `--captains --sag --riders` (composition), `--duration` (seconds),
`--interval` (ms between each rider's pings). `teardown --all` removes every leftover
load-test artifact regardless of run.

`seed` writes `.run.json` (ride id, credentials, runTag) which `run` and `teardown` read.

## What it reports

- **Sends** vs **deliveries** (fan-out) and delivery rate/sec.
- **Latency** p50/p95/p99/max — measured in-process (`now − payload.ts`), so it's
  **skew-free** server round-trip, cleaner than the app's cross-device number.
- **Quota projection** — deliveries extrapolated to a 30-min ride as a % of the
  free-tier 2M msgs/mo, and how many such rides exhaust the month. Plus a concurrent-
  connection check against the 200 free-tier limit.

## Faithful observer (optional)

Point the staging **Race Control web** page (`/race-control/<rideId>`,
`VITE_RAIL3_FLEET_ENABLED=true`) at the seeded ride id to *watch* the fleet render
under load on the real pipeline while the harness drives it.

## Notes / limits

- One Node process opens N websockets + N send loops. Fine for the low hundreds; for
  very high N split across machines.
- Access tokens live ~1h; a run longer than that refreshes on the first 401.
- **Freeze staging during a run** (no migrations/resets). Watch the realtime quota; be
  ready to bump staging to Pro for a high-N or long run.
