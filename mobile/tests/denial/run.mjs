// W309 — runner for the denial suite.
//
//   npm run denial:local            local stack (CI); needs SUPABASE_URL / _ANON_KEY / _SERVICE_ROLE_KEY
//   npm run denial:staging          the staging project (keys read at run time, never stored)
//   ... -- --strict                 every rule must hold (the W317 cutover run); advisory cases do not gate
//   ... -- --sweep                  only remove anything a crashed run left behind
//   ... -- --only T2,T5             run a subset
//   ... -- --out <dir>              where the report goes (default tests/denial/out)
//
// Exit code. With baseline.json present the run must MATCH it: a rule that is red where the
// baseline says green is a regression; a rule that is green where the baseline says red
// means enforcement landed and the baseline must be updated in the same change. An `error`
// (the suite could not judge a rule) or any leftover test row always fails the run.

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveTarget, makeAdmin, buildFixtures, waitForRealtime, sweep, leftovers, closeAll, Red, MARK } from './harness.mjs';
import { cases } from './rules.mjs';
import { LAYOUT } from './layout.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);

const targetName = opt('target', 'local');
const outDir = opt('out', join(here, 'out'));
const only = opt('only', null)?.split(',').map((x) => x.trim().toUpperCase());

const target = await resolveTarget(targetName);
const admin = makeAdmin(target);
const log = (m) => console.log(m);

if (flag('sweep')) {
  const left = await sweep(admin, log);
  console.log(`sweep (${targetName}) leftovers:`, JSON.stringify(left));
  process.exit(Object.values(left).some((n) => n > 0) ? 1 : 0);
}

// Ctrl-C or a kill only raises a flag. Fixture building and the case loop stop at their next
// step, and the one verified cleanup below runs as usual, so nothing is created while rows
// are being removed. A second signal exits at once.
let interrupted = false;
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    if (interrupted) {
      console.error(`\nStopped before cleanup finished. Run again with --sweep against ${targetName}.`);
      process.exit(1);
    }
    interrupted = true;
    console.error(`\n${sig}: stopping, then removing test rows`);
  });
}

const before = await leftovers(admin);
if (Object.values(before).some((n) => n > 0)) {
  console.log(`found rows from an earlier run (${JSON.stringify(before)}); removing them first`);
  await sweep(admin, log);
}

const run = `${MARK}${Date.now().toString(36)}`;
const ctx = { target, admin, run, open: new Set(), state: {}, fx: null, interrupted: () => interrupted };
const results = [];
let fatal = null;

// --only picks rules or cases; a case another one builds on is pulled in with it.
const selected = new Set(cases.filter((c) => !only || only.includes(c.rule) || only.includes(c.id)).map((c) => c.id));
for (const c of cases) if (selected.has(c.id)) for (const dep of c.needs ?? []) selected.add(dep);
if (selected.size === 0) {
  console.error(`--only ${only.join(',')} matches no rule or case (use ids such as T5 or T5.1)`);
  process.exit(2);
}

try {
  await buildFixtures(ctx);
  await waitForRealtime(ctx);
  for (const c of cases) {
    if (!selected.has(c.id)) continue;
    if (interrupted) break;
    const t0 = Date.now();
    let status = 'green';
    let detail = '';
    try {
      await c.run(ctx);
    } catch (e) {
      status = e instanceof Red ? 'red' : 'error';
      detail = e.message;
    } finally {
      await closeAll(ctx);
    }
    results.push({ id: c.id, rule: c.rule, title: c.title, status, detail, advisory: c.advisory ?? false, ms: Date.now() - t0 });
    console.log(`${status.toUpperCase().padEnd(5)} ${c.id.padEnd(6)} ${c.title}${detail ? `\n        ${detail}` : ''}`);
  }
} catch (e) {
  fatal = e;
  console.error(`FATAL: ${e.message}`);
} finally {
  await closeAll(ctx);
  // The connection T14.1 hands to T4.4 is closed here if T4.4 never took it.
  await ctx.state.endingRideListener?.close();
}

// Cleanup. If it cannot be completed or verified, the run fails and says so: an unverified
// cleanup is never reported as clean.
let left = null;
let cleanupError = null;
for (let attempt = 1; attempt <= 3 && left == null; attempt += 1) {
  try {
    left = await sweep(admin, log);
  } catch (e) {
    cleanupError = e.message;
    await new Promise((r) => setTimeout(r, 3000));
  }
}
if (left) cleanupError = null;
const dirty = left == null || Object.values(left).some((n) => n > 0);
if (left == null) {
  console.error(`CLEANUP NOT VERIFIED (${cleanupError}). Run again with --sweep against ${targetName}.`);
}

// ── Compare with the recorded baseline ───────────────────────────────────────
const baselinePath = join(here, 'baseline.json');
const baseline = existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, 'utf8')) : null;
const expected = (id) => baseline?.targets?.[targetName]?.[id] ?? baseline?.cases?.[id] ?? null;
const drift = [];
if (baseline) {
  for (const r of results) {
    const want = expected(r.id);
    if (want == null) drift.push(`${r.id}: not in the baseline (ran ${r.status})`);
    else if (want !== r.status) drift.push(`${r.id}: baseline ${want}, ran ${r.status}`);
  }
  if (!only) {
    for (const id of Object.keys(baseline.cases ?? {})) {
      if (!results.find((r) => r.id === id)) drift.push(`${id}: in the baseline but did not run`);
    }
  }
}

// ── Report ───────────────────────────────────────────────────────────────────
const rules = [...new Set(cases.map((c) => c.rule))].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
const ruleStatus = (r) => {
  const rs = results.filter((x) => x.rule === r && !x.advisory);
  if (!rs.length) return 'not run';
  if (rs.some((x) => x.status === 'error')) return 'error';
  return rs.some((x) => x.status === 'red') ? 'FAILS' : 'passes';
};
const report = {
  target: targetName,
  layout: LAYOUT,
  ran_at: new Date().toISOString(),
  commit: process.env.GITHUB_SHA ?? null,
  rules: Object.fromEntries(rules.map((r) => [r, ruleStatus(r)])),
  cases: results,
  leftovers: left,
  cleanup_error: cleanupError,
  drift,
  fatal: fatal?.message ?? null,
};
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, `denial-${targetName}.json`), JSON.stringify(report, null, 2));
const md = [
  `# Denial suite — ${targetName} — ${report.ran_at}`,
  '',
  `Channel layout under test: ${LAYOUT}`,
  '',
  '| Rule | Result | Case | What was tested | Finding |',
  '|---|---|---|---|---|',
  ...results.map((r) => `| ${r.rule} | ${r.status}${r.advisory ? ' (advisory)' : ''} | ${r.id} | ${r.title} | ${r.detail.replaceAll('|', '/')} |`),
  '',
  `Per rule: ${rules.map((r) => `${r} ${ruleStatus(r)}`).join(', ')}`,
  '',
  left ? `Leftover test rows after cleanup: ${JSON.stringify(left)}` : `CLEANUP NOT VERIFIED: ${cleanupError}`,
  ...(drift.length ? ['', 'Differences from baseline.json:', ...drift.map((d) => `- ${d}`)] : []),
].join('\n');
writeFileSync(join(outDir, `denial-${targetName}.md`), `${md}\n`);

console.log(`\nPer rule: ${rules.map((r) => `${r} ${ruleStatus(r)}`).join(', ')}`);
console.log(`Leftover test rows: ${JSON.stringify(left)}`);
console.log(`Report: ${join(outDir, `denial-${targetName}.md`)}`);

let code = 0;
if (fatal || dirty || interrupted) code = 1;
if (results.some((r) => r.status === 'error')) code = 1;
// --strict: every rule must hold. Advisory cases are reported and never gate.
if (flag('strict') && results.some((r) => r.status !== 'green' && !r.advisory)) code = 1;
if (drift.length) {
  console.log(`\nDiffers from baseline.json:\n${drift.map((d) => `  ${d}`).join('\n')}`);
  code = 1;
}
if (!baseline) console.log('\nNo baseline.json yet: report only.');
process.exit(code);
