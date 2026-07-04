#!/usr/bin/env node
// W180 — Rail 3 synthetic-fleet load-test harness (model C).
//
// Drives Supabase Broadcast fan-out at a configurable fleet size against STAGING,
// through the REAL pipeline: N fake riders (seeded as real ride_participants) each
// (a) REST-broadcast a `pos` ping on the private rail3:ride:<id> channel — the exact
// path mobile/src/lib/backgroundLocation.ts:restBroadcast uses — and (b) subscribe to
// the same channel over a websocket, so we reproduce W193's O(N^2) delivery blow-up
// (delivery = sends × connected subscribers) instead of just measuring sends.
//
// Latency is measured in-process (now - payload.ts) with ZERO clock skew — every
// sender and receiver share one Node clock, so the delta is true server round-trip
// fan-out, cleaner than the app's cross-device measurement.
//
//   node loadtest.mjs seed [--captains N --sag N --riders N]
//   node loadtest.mjs run  [--duration SEC --interval MS]
//   node loadtest.mjs teardown [--all]
//   node loadtest.mjs all  [all flags]   # seed → run → teardown
//
// Config (env, or a sibling .env file): STAGING_URL, STAGING_ANON_KEY, LOADTEST_SECRET.

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const RUN_FILE = join(HERE, '.run.json')

// ── env (.env is a convenience; real env wins) ─────────────────────────────────
function loadEnv() {
  const f = join(HERE, '.env')
  if (existsSync(f)) {
    for (const line of readFileSync(f, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  }
}
loadEnv()

const URL = process.env.STAGING_URL
const ANON = process.env.STAGING_ANON_KEY
const SECRET = process.env.LOADTEST_SECRET
function requireEnv() {
  const missing = ['STAGING_URL', 'STAGING_ANON_KEY', 'LOADTEST_SECRET'].filter((k) => !process.env[k])
  if (missing.length) {
    console.error(`Missing env: ${missing.join(', ')} (set them or put a loadtest/.env)`)
    process.exit(1)
  }
}

// ── arg parsing ────────────────────────────────────────────────────────────────
function flags() {
  const out = {}
  const a = process.argv.slice(3)
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith('--')) {
      const k = a[i].slice(2)
      const v = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true
      out[k] = v
    }
  }
  return out
}
const num = (v, d) => (v == null ? d : Number(v))

// ── edge-fn call ─────────────────────────────────────────────────────────────
async function callFn(name, body) {
  const res = await fetch(`${URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: ANON,
      Authorization: `Bearer ${ANON}`,
      'x-loadtest-secret': SECRET,
    },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json.error) throw new Error(`${name}: ${res.status} ${json.error ?? JSON.stringify(json)}`)
  return json
}

// ── commands ─────────────────────────────────────────────────────────────────
async function seed(f) {
  requireEnv()
  const body = {
    captains: num(f.captains, 2),
    sag: num(f.sag, 2),
    riders: num(f.riders, 16),
  }
  console.log(`Seeding fleet ${JSON.stringify(body)} …`)
  const run = await callFn('loadtest-seed', body)
  writeFileSync(RUN_FILE, JSON.stringify(run, null, 2))
  console.log(`✓ ride ${run.rideId}  (runTag ${run.runTag}, ${run.composition.total} riders on ${run.tenantName})`)
  console.log(`  saved → ${RUN_FILE}`)
  return run
}

function loadRun() {
  if (!existsSync(RUN_FILE)) throw new Error(`no ${RUN_FILE} — run "seed" first`)
  return JSON.parse(readFileSync(RUN_FILE, 'utf8'))
}

const pct = (arr, p) => {
  if (!arr.length) return 0
  const s = [...arr].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]
}

async function run(f) {
  requireEnv()
  const runInfo = loadRun()
  const duration = num(f.duration, 300) * 1000 // default 5 min
  const interval = num(f.interval, 3000) // default 1 ping / 3s (matches W192/W193)
  const { rideId, topic, password, start } = runInfo
  const riders = runInfo.riders
  const N = riders.length

  console.log(`Signing in ${N} riders …`)
  let sends = 0
  let deliveries = 0
  const latencies = []
  const senders = []

  // Sign in + subscribe each rider. One supabase client per rider = one realtime
  // websocket (a genuine connected subscriber, required to reproduce N-way fan-out).
  await Promise.all(
    riders.map(async (r, i) => {
      const client = createClient(URL, ANON, {
        auth: { persistSession: false, autoRefreshToken: true },
        realtime: { params: { eventsPerSecond: 40 } },
      })
      const { data, error } = await client.auth.signInWithPassword({ email: r.email, password })
      if (error) throw new Error(`sign-in ${r.email}: ${error.message}`)
      let token = data.session.access_token
      client.realtime.setAuth(token)

      const ch = client.channel(topic, { config: { private: true, broadcast: { self: true } } })
      ch.on('broadcast', { event: 'pos' }, ({ payload }) => {
        deliveries++
        if (typeof payload?.ts === 'number') latencies.push(Date.now() - payload.ts)
      })
      await new Promise((res, rej) => {
        ch.subscribe((status, err) => {
          if (status === 'SUBSCRIBED') res()
          else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') rej(err || new Error(status))
        })
      })

      // Spread riders on a ~300m ring around the start so markers are distinct.
      const ang = (i / N) * 2 * Math.PI
      let lat = start.lat + 0.0027 * Math.cos(ang)
      let lng = start.lng + 0.0027 * Math.sin(ang)
      senders.push(async () => {
        lat += (Math.random() - 0.5) * 0.0002 // ~±11m jitter/tick = movement
        lng += (Math.random() - 0.5) * 0.0002
        const res = await fetch(`${URL}/realtime/v1/api/broadcast`, {
          method: 'POST',
          headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [
              { topic, event: 'pos', private: true, payload: { riderId: r.accountId, state: 'active', lat, lng, ts: Date.now() } },
            ],
          }),
        })
        if (res.status === 401) {
          // token aged out on a >1h run — refresh from the auto-refreshed session
          const { data: s } = await client.auth.getSession()
          if (s.session) { token = s.session.access_token; client.realtime.setAuth(token) }
        } else {
          sends++
        }
      })
    }),
  )

  console.log(`✓ ${N} subscribed. Broadcasting every ${interval}ms for ${duration / 1000}s …`)
  // Stagger each rider's first send by a sub-interval phase offset so N pings don't
  // all fire in the same instant; clearInterval/clearTimeout are interchangeable in
  // Node, so a single handle list cleans up both the offset timeouts and the intervals.
  const timers = []
  senders.forEach((send, i) => {
    timers.push(
      setTimeout(() => timers.push(setInterval(send, interval)), Math.floor((i / N) * interval)),
    )
  })
  const progress = setInterval(
    () => console.log(`  … sends=${sends} deliveries=${deliveries} p50=${pct(latencies, 50)}ms`),
    Math.min(15000, duration),
  )

  await new Promise((res) => setTimeout(res, duration))
  timers.forEach(clearInterval)
  clearInterval(progress)
  // let in-flight deliveries settle
  await new Promise((res) => setTimeout(res, 1500))

  report({ N, runInfo, duration, interval, sends, deliveries, latencies })
}

function report({ N, runInfo, duration, interval, sends, deliveries, latencies }) {
  const secs = duration / 1000
  const dPerSec = deliveries / secs
  // Extrapolate to a 30-min ride and to a month of 2M messages (W193 counts DELIVERIES).
  const per30min = Math.round(dPerSec * 1800)
  const FREE_MSG_QUOTA = 2_000_000
  const FREE_CONN_LIMIT = 200
  const c = runInfo.composition
  console.log(`
──────────────────────────────────────────────────────────────
 W180 LOAD TEST — Rail 3 Broadcast fan-out
──────────────────────────────────────────────────────────────
 Fleet         : ${c.total}  (captains ${c.captains}, support ${c.sag}, riders ${c.riders})
 Subscribers   : ${N} concurrent websockets   (free-tier limit ${FREE_CONN_LIMIT} → ${N <= FREE_CONN_LIMIT ? 'OK' : 'OVER'})
 Duration      : ${secs}s   Ping interval: ${interval}ms  (${(1000 / interval).toFixed(2)}/s per rider)
 ─ Volume ─
 Sends (broadcasts)        : ${sends}
 Deliveries (fan-out)      : ${deliveries}   ≈ sends × subscribers
 Delivery rate             : ${dPerSec.toFixed(0)}/s
 ─ Latency (server round-trip, skew-free) ─
 p50 / p95 / p99 / max     : ${pct(latencies, 50)} / ${pct(latencies, 95)} / ${pct(latencies, 99)} / ${Math.max(0, ...latencies)} ms
 mean                      : ${latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0} ms
 ─ Quota projection (free tier = ${FREE_MSG_QUOTA.toLocaleString()} msgs/mo, W193 counts deliveries) ─
 This fleet, one 30-min ride : ${per30min.toLocaleString()} deliveries  (${((per30min / FREE_MSG_QUOTA) * 100).toFixed(2)}% of monthly quota)
 Monthly quota exhausted after ≈ ${Math.floor(FREE_MSG_QUOTA / Math.max(1, per30min))} such rides
──────────────────────────────────────────────────────────────
 runTag ${runInfo.runTag} — remember to: node loadtest.mjs teardown
`)
}

async function teardown(f) {
  requireEnv()
  const body = f.all ? { all: true } : { runTag: loadRun().runTag }
  console.log(`Tearing down ${JSON.stringify(body)} …`)
  const res = await callFn('loadtest-teardown', body)
  console.log(`✓ removed rides=${res.deletedRides} accounts=${res.deletedAccounts} authUsers=${res.deletedAuthUsers}`)
}

// ── main ─────────────────────────────────────────────────────────────────────
const cmd = process.argv[2]
const f = flags()
try {
  if (cmd === 'seed') await seed(f)
  else if (cmd === 'run') await run(f)
  else if (cmd === 'teardown') await teardown(f)
  else if (cmd === 'all') {
    await seed(f)
    await run(f)
    await teardown(f)
  } else {
    console.log('usage: node loadtest.mjs <seed|run|teardown|all> [--captains N --sag N --riders N --duration SEC --interval MS] [--all]')
    process.exit(1)
  }
  process.exit(0)
} catch (e) {
  console.error(`✗ ${e.message}`)
  process.exit(1)
}
