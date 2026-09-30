// W280 — Pure advisory policy for the Battery Saver screen-lock advisory (Pillar II §2
// "on ride join and on screen lock", §5.1 device-advisory exception; Ledger B3; R3-06/R3-49).
//
// Erasable TypeScript only, no react-native imports: this module is exercised directly by
// tests/advisoryPolicy.test.mjs under `node --experimental-strip-types --test`, following the
// beaconLogic.ts pattern. Every function here returns a DECISION, never an action, and no
// decision can block anything — the advisory is surfaced or it is not; join, engine start and
// the recovery chain never consult it (R3-49, D86 "MUST stay non-blocking").

export type SaverAdvisoryInput = {
  // OS Battery Saver / Low Power Mode is on (expo-battery on Android; false elsewhere).
  saverOn: boolean;
  // The R3-40 self-health prompt is firing for this same unlock. Until the self-health
  // overlay ticket lands this is wired to a stub that always reports false (W280 LLD).
  selfHealthPromptActive: boolean;
};

// The three outcomes of the §5.1 collision rule. 'suppress' is distinguishable from 'none'
// so a later telemetry row can say WHY nothing was shown. There is deliberately no fourth
// value: no outcome of this policy can gate a rider.
export type SaverAdvisoryDecision = 'show' | 'suppress' | 'none';

// §5.1 collision rule: at unlock the self-health prompt takes precedence, and the Saver
// advisory is suppressed while it fires. The Saver advisory stands alone when Saver is on
// but tracking is healthy. Saver off → nothing, whatever self-health is doing.
export function decideSaverAdvisory(input: SaverAdvisoryInput): SaverAdvisoryDecision {
  if (!input.saverOn) return 'none';
  return input.selfHealthPromptActive ? 'suppress' : 'show';
}

export function shouldShowSaverAdvisory(input: SaverAdvisoryInput): boolean {
  return decideSaverAdvisory(input) === 'show';
}

// AppState-shaped input, kept as a plain string union so the policy stays react-native-free.
export type AppStateLike = 'active' | 'background' | 'inactive' | 'unknown' | 'extension';

// Screen lock is proxied by the foreground → background/inactive transition in the managed
// workflow (there is no native lock listener, by ruling). 'lock' fires ONCE per lock cycle:
// only the transition OUT of 'active' counts, so an inactive → background flap (Android
// fires both on a lock) cannot produce a second advisory. 'unlock' is the return to 'active'.
export type LockTransition = 'lock' | 'unlock' | 'none';

export function lockTransition(prev: AppStateLike, next: AppStateLike): LockTransition {
  if (prev === 'active' && (next === 'background' || next === 'inactive')) return 'lock';
  if (prev !== 'active' && next === 'active') return 'unlock';
  return 'none';
}

// Everything the screen-lock watcher touches in the world, injected so the state machine
// below is testable under node with fakes (review round 1: the subscribe-once / dispose /
// one-per-cycle behaviour is where the risk lives, and the pure truth table cannot reach it).
export type ScreenLockSaverWatcherDeps = {
  currentState: () => AppStateLike;
  // Subscribe to AppState changes; returns the unsubscribe.
  addEventListener: (handler: (next: AppStateLike) => void) => () => void;
  // Battery Saver read (expo-battery on Android). Never throws by contract; a rejection is
  // treated as "not on" here anyway — a missed advisory is harmless, a crash is not.
  readSaver: () => Promise<boolean>;
  isSelfHealthPromptActive: () => boolean;
  // Surface the advisory. Fire-and-forget; nothing awaits or reads its outcome.
  show: () => void;
};

// The screen-lock Battery Saver watcher (Ledger B3, R3-06), as a pure state machine.
//   • The LOCK transition ARMS the check for this lock cycle (R3-06 "on screen lock event").
//   • The next UNLOCK reads Battery Saver ONCE and applies the §5.1 collision gate with the
//     self-health state of that unlock. Reading at unlock (not at lock) means a Saver that
//     switched on WHILE locked — Android's automatic low-battery onset — is surfaced at that
//     same unlock, a rider who switched it OFF from the lock screen (R3-47) is never nagged,
//     and there is no lock-time promise that can resolve after the unlock handler ran.
//   • One advisory per lock cycle: the inactive → background flap is not a second lock, and a
//     read still pending when a NEWER lock cycle begins is discarded (that cycle re-arms).
//   • Exactly one subscription per call; disposing removes it once and silences any read
//     still in flight. Nothing here can block anything (R3-49).
export function createScreenLockSaverWatcher(deps: ScreenLockSaverWatcherDeps): () => void {
  let prev: AppStateLike = deps.currentState();
  let armed = false;
  let cycle = 0;
  let disposed = false;

  const remove = deps.addEventListener((next) => {
    const transition = lockTransition(prev, next);
    prev = next;
    if (transition === 'lock') {
      armed = true;
      cycle += 1;
    } else if (transition === 'unlock' && armed) {
      armed = false;
      const thisCycle = cycle;
      deps
        .readSaver()
        .then((saverOn) => {
          if (disposed || thisCycle !== cycle) return;
          if (
            shouldShowSaverAdvisory({
              saverOn,
              selfHealthPromptActive: deps.isSelfHealthPromptActive(),
            })
          ) {
            deps.show();
          }
        })
        .catch(() => {});
    }
  });

  return () => {
    if (disposed) return; // idempotent: a repeated cleanup never double-removes
    disposed = true;
    remove();
  };
}
