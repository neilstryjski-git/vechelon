# Rail 3 — Local Supabase + CI Integration-Test Harness

Task **W183**. This is the isolated, real environment Rail 3 uses to run
integration / RLS tests **without ever touching the hosted production Supabase
project** (`drktcxggaizkbvqccfhp`). It is the foundation the DoD-12 cross-tenant
isolation gate (**W182 / 3549**) and every Rail 3 DB task (**W169 schema** →
W170, W171) build on.

## Why this exists — the test-environment principle

Production must never be affected by Rail 3 development, and Vechelon is on the
Supabase **free tier** (max 2 hosted projects/org). So:

| Rung | Environment | What runs there |
|---|---|---|
| dev + CI | **local stack** (`supabase start`, Docker) — free, doesn't count against the project cap | all correctness / RLS / integration tests, incl. this gate and DoD-12 |
| field / perf | a separate **free** `rail3-staging` project | the PoC field test, Broadcast/GPS/maps perf (W182's perf siblings) |
| production | promotion gate only | additive migrations, reviewed, applied via `supabase db push --linked` |

**Load-bearing rule:** there is one `supabase/migrations` dir linked to prod, and
merge-to-master triggers `supabase db push --linked`. So **Rail 3 schema
migrations must not merge to master until the production promotion gate** — they
are developed and tested here, on the local stack, first.

## What the harness does

1. `supabase start` boots an ephemeral local Postgres + Auth + Realtime in Docker
   and applies all `supabase/migrations`.
2. `supabase/tests/rail3_rls_isolation.test.sql` runs via `psql -v ON_ERROR_STOP=1`
   — any `RAISE EXCEPTION` fails the job. It asserts:
   - RLS is **enabled** on every tenant-scoped table, and
   - a real **cross-tenant denial**: an authenticated Tenant-A member cannot see
     Tenant-B's `accounts` / `account_tenants` rows, and is not over-blocked from
     their own.
3. CI (`.github/workflows/rail3-ci.yml`) wires this as a **merge gate** on PRs to
   `master` that touch `supabase/**` or `mobile/**`.

This is the harness-*proving* gate.

### The DoD-12 behavioral matrix (W182 / 3549)

On top of the SQL gate, the same workflow runs
`mobile/tests/rlsIsolation.test.mjs` (`cd mobile && npm test`) against the local
stack — real signed-in users via supabase-js, covering **both** isolation layers:

- **DB RLS (W169):** cross-tenant `beacon_alerts` / `rider_states` reads return
  zero rows; in-tenant access works; a tenant with no Rail 3 data reads cleanly.
- **Broadcast authz (W170 / G-1):** subscribing to another tenant's private
  `rail3:ride:<uuid>` channel is denied **by the real Realtime server**; the
  in-tenant subscribe + send succeeds; an unknown-ride topic is fail-closed.
  A DB-only matrix would miss a Broadcast leak — this layer is why the matrix
  is a Node test, not more SQL.
- **Isolation regression control:** the web app's in-tenant queries on shared
  tables (`rides`, `ride_participants`, `tenants`) still behave identically
  after the Rail 3 schema — in both directions (no loss, no widening).

Like the SQL gate, the matrix **skips** its Rail 3 assertions when the held
W169/W170 migrations aren't applied (e.g. master-based PRs), so it is safe on
every PR; the full matrix executes on branches carrying the Rail 3 migrations
and permanently once they merge at the promotion gate.

To run it locally (needs Docker + the stack up):

```sh
eval "$(npx supabase status -o env)"
cd mobile && npm install
SUPABASE_URL=$API_URL SUPABASE_ANON_KEY=$ANON_KEY \
  SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY npm test
```

## Run it locally

Prerequisites: Docker running, and the Supabase CLI (already a root devDependency
— use `npx supabase`).

```sh
# from repo root
npx supabase start                 # boots local stack + applies migrations
eval "$(npx supabase status -o env)"
psql "${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}" \
  -v ON_ERROR_STOP=1 \
  -f supabase/tests/rail3_rls_isolation.test.sql
npx supabase stop                  # tear down when done
```

A green run ends with `Rail 3 RLS isolation gate: PASSED`. A leak or an
over-block aborts with a non-zero exit and a descriptive message.

## How to extend it (for W169 / W182)

- Add new Rail 3 tables and policies via a migration (additive-only — see the
  W169 isolation pitfalls). `supabase start` / `db reset` picks them up.
- Add behavioral assertions to `rail3_rls_isolation.test.sql` (or a sibling
  `*.test.sql`) following the same pattern: seed fixtures with
  `session_replication_role = 'replica'` to skip FK setup, then assert as the
  `authenticated` role with `request.jwt.claims`.
- Keep every assertion executable (`RAISE EXCEPTION` on failure) so the gate
  stays pass/fail — never a comment-only checklist.

## Making it an enforced merge gate

The workflow runs on PRs to `master`, but CI passing only *blocks* a merge once
the job is a **required status check**. After the first run lands:

1. GitHub → repo **Settings → Branches → Branch protection** for `master` → mark
   **`db-rls-gate`** as a required status check.
2. Note the interaction with the `paths:` filter: on a PR that touches neither
   `supabase/**` nor `mobile/**`, the job doesn't run, so a required check can sit
   pending. If you want the gate required on *every* PR, drop the `paths:` filter
   (it will then run — and pass quickly — even on unrelated PRs).

## Guardrails (do not break these)

- **Local only.** The gate refuses to run against a non-local `DB_URL`. Never
  point tests at `drktcxggaizkbvqccfhp`.
- **Additive & Rail-3-scoped.** This workflow must not build, gate, or alter the
  `admin/` Vercel build. `mobile/` stays outside the admin build.
- **No extra hosted projects for CI.** CI uses the local stack; the one free
  hosted slot is reserved for `rail3-staging`.
