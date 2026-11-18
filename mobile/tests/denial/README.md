# Denial suite: rules T1 to T16 (W309)

Proves, as real signed-in users, the visibility and contact rules of Pillar II §4.1 and the
Sprint 2 brief §4. Each rule has one or more cases in `rules.mjs`.

## Run it

| Where | Command |
|---|---|
| Local stack (this is what Rail 3 CI runs) | `cd mobile && SUPABASE_URL=… SUPABASE_ANON_KEY=… SUPABASE_SERVICE_ROLE_KEY=… npm run denial:local` |
| Staging (`xybgtbybdhxuwqjfcfkc`) | `cd mobile && npm run denial:staging` |

The staging command reads the project's keys from the Supabase Management API at run time,
using the access token in `SUPABASE_ACCESS_TOKEN` or `~/.supabase/access-token`. No key is
written to disk. The project ref is fixed in `harness.mjs`; production is refused.

Options after `--`: `--strict` (every rule must hold: the cutover run), `--only T2,T5`,
`--sweep` (only remove what a crashed run left), `--out <dir>`.

## What a run does

1. Removes anything an earlier run left behind.
2. Creates two test clubs, twelve test users, three rides and their participant rows. All
   carry the marker `w309-` (club slug, user email `w309-…@test.local`) or `W309 TEST` (names).
3. Signs each user in for a real JWT and runs the cases in order. Every realtime
   subscription opens a fresh connection, because Realtime caches authorization per connection.
4. Removes everything it created, by id, and counts what still carries the marker. Any
   leftover fails the run.

The service-role client only builds fixtures and reads back the truth after an attempt. It is
never the actor, with one stated exception: T13 calls `delete_account_data`, which is
service-role only by design.

## Results and the baseline

A case is `green` (the rule holds), `red` (it does not) or `error` (the suite could not judge
it: a fixture or a control failed). A denial is only believed when its control passes in the
same case, so a message that was never sent cannot pass as "not received".

`baseline.json` records the status every case must report. A run that differs fails:

- red where the baseline says green: a regression.
- green where the baseline says red: enforcement landed. Flip the entry in the same change.

`baseline.targets.staging` holds any recorded staging-only exception.

## When the channel layout or the roster path changes

Edit `layout.mjs` only. The rules never name a topic or a table for the things W193, D94
and W313 are changing; they ask `layout.mjs` which topics a role receives on and sends on, and
how a rider's device reads the roster. The pre-W193 topic stays in `allTopics()` permanently,
so a layout that leaves the old channel open is still caught.
