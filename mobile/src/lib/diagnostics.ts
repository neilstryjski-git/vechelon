import type BackgroundGeolocationType from 'react-native-background-geolocation';

// W232 — Field diagnostics: pull the Transistorsoft on-device log off a tester's phone.
//
// TS keeps a verbose on-device log (logLevel: VERBOSE in bgGeo.ts) holding each fix with
// coordinates + the device's per-fix accuracy estimate (hAcc). This lets a tester send
// that log after a ride so we can run the zero-build GPS-accuracy harness
// (tools/rail3_ts_log_accuracy.py): align fixes vs a synchronous RWGPS GPX → real
// cross-track error, WITHOUT the app ever persisting coordinates server-side.
//
// PRIVACY-CRITICAL: use logger.emailLog (or getLog) ONLY — a MANUAL, consented pull. Do
// NOT use logger.uploadLog: it POSTs the coordinate-bearing log to a server, which would
// breach the "Vechelon never stores coordinates server-side" posture. emailLog opens the
// tester's own mail client pre-addressed with the log attached; they choose to send it.
//
// Closed-test diagnostic only — folds into the W208 production strip (which also takes
// logLevel to OFF, after which there is nothing to send).

// The triage recipient the log email is pre-addressed to. The tester can still change it
// in their mail client before sending (emailLog only pre-fills).
const DIAGNOSTIC_RECIPIENT = 'neil.stryjski@gmail.com';

// Lazy require — mirrors bgGeo.ts: never touch the native module at bundle-eval time.
function getBgGeo(): typeof BackgroundGeolocationType {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('react-native-background-geolocation').default;
}

export type SendLogResult = { ok: true } | { ok: false; error: string };

// Compose an email with the full TS diagnostic log attached, pre-addressed to the triage
// recipient. Resolves to a result the caller turns into a UI alert. Never throws.
export async function sendDiagnosticLog(): Promise<SendLogResult> {
  try {
    const BG = getBgGeo();
    // emailLog returns once the mail composer is presented (or errors if no mail account
    // is configured / the log is empty).
    await BG.logger.emailLog(DIAGNOSTIC_RECIPIENT);
    return { ok: true };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    return { ok: false, error };
  }
}
