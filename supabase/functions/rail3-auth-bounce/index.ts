import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

/**
 * rail3-auth-bounce edge function (Rail 3 / staging only)
 *
 * Fixes D48: on Android the magic-link return dead-ends because mobile browsers
 * refuse to follow a server (302) redirect from an https page into a custom URL
 * scheme (rail3://) without a user gesture. So instead of redirecting Supabase
 * straight to rail3://auth, the native app sets its magic-link redirectTo to THIS
 * https page, which then launches the app via rail3://auth on a user TAP (the tap
 * is the gesture Android requires).
 *
 * It is hit in two stages, both handled client-side in the page below:
 *   1. Click-through wrap: send-magic-link sends the email button to this page with
 *      ?c=<base64(verify-url)> (scanner-pre-fetch defence — scanners don't run JS).
 *      The JS decodes `c` and redirects the real browser to the Supabase verify URL.
 *   2. Post-verify: Supabase verifies the OTP and 302-redirects back here with the
 *      session in the URL FRAGMENT (#access_token=...&refresh_token=...). The JS reads
 *      the fragment and shows an "Open Vechelon Rail 3" button → rail3://auth#<fragment>.
 *
 * Public (no JWT): the browser loads it via a plain redirect with no Authorization
 * header, so this MUST be deployed with verify_jwt = false (config.toml +
 * --no-verify-jwt). It serves only static HTML and reads no secrets.
 */

const APP_SCHEME_URL = 'rail3://auth'

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>Vechelon Rail 3 — Sign in</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    background: #0E0E10; color: #fff; font-family: -apple-system, system-ui, Segoe UI, Roboto, sans-serif; padding: 24px; }
  .card { width: 100%; max-width: 420px; background: #1A1A1D; border: 1px solid #2C2C30; border-radius: 16px; padding: 32px 28px; text-align: center; }
  .test { background: #b91c1c; color: #fff; font-size: 11px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; padding: 8px 12px; border-radius: 8px; margin-bottom: 20px; }
  .brand { font-style: italic; font-weight: 800; font-size: 28px; letter-spacing: 1px; margin: 0 0 6px; }
  .sub { color: #9A9A9A; font-size: 11px; letter-spacing: 3px; text-transform: uppercase; margin: 0 0 24px; }
  #msg { color: #B8B8B8; font-size: 14px; line-height: 1.5; margin: 0 0 24px; }
  .btn { display: none; background: #E11D2A; color: #fff; text-decoration: none; padding: 15px 28px; border-radius: 12px;
    font-weight: 700; font-size: 14px; letter-spacing: 1.5px; text-transform: uppercase; }
  .hint { display: none; color: #5A5A5A; font-size: 11px; margin: 16px 0 0; }
</style>
</head>
<body>
  <div class="card">
    <div class="test">&#9888; Rail 3 TEST environment</div>
    <h1 class="brand">VECHELON</h1>
    <p class="sub">Rail 3 — Mobile Tactical</p>
    <p id="msg">Finishing sign-in&hellip;</p>
    <a id="openBtn" class="btn">Open Vechelon Rail 3</a>
    <p id="hint" class="hint">Tap to return to the app. If nothing opens, make sure Vechelon Rail 3 is installed.</p>
  </div>
  <script>
    (function () {
      var msg = document.getElementById('msg');
      var params = new URLSearchParams(location.search);
      var c = params.get('c');

      // Stage 1 — click-through wrap: decode and redirect to the real verify URL.
      // Done in JS so email-scanner pre-fetch (no JS) can't consume the one-time OTP.
      if (c) {
        try {
          location.replace(atob(c));
        } catch (e) {
          msg.textContent = 'This sign-in link is invalid. Request a new one from the app.';
        }
        return;
      }

      // Stage 2 — post-verify: tokens arrive in the URL fragment.
      var hash = location.hash ? location.hash.substring(1) : '';
      var hp = new URLSearchParams(hash);
      var err = hp.get('error_description') || hp.get('error');
      if (err) {
        msg.textContent = decodeURIComponent(err);
        return;
      }
      if (hp.get('access_token')) {
        var appUrl = ${JSON.stringify(APP_SCHEME_URL)} + '#' + hash;
        var btn = document.getElementById('openBtn');
        btn.setAttribute('href', appUrl);
        btn.style.display = 'inline-block';
        document.getElementById('hint').style.display = 'block';
        msg.textContent = "You're signed in. Tap below to open the app.";
        return;
      }

      msg.textContent = 'No sign-in token found. Request a new link from the app.';
    })();
  </script>
</body>
</html>`

serve((req) => {
  const headers = {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  }
  if (req.method === 'OPTIONS') return new Response('ok', { headers })
  return new Response(html, { headers })
})
