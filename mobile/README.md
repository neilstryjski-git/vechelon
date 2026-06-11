# Vechelon Rail 3 — Mobile Tactical (PoC)

React Native **Expo** app (managed workflow) for the Rail 3 PoC. Android-only for
the PoC (iOS excluded — SD-004). This task (**W168**) is the authenticated shell:
Supabase magic-link sign-in, session persistence, and an auth-gated navigation
base. Feature surfaces (fleet map, Support Beacon, ride controls) land in later
Rail 3 tasks.

Bedrock trace: Pillar II §1 (PoC), §2 (Stack); LOE §4; ledger S0-004.

## Stack

- Expo SDK 52 (React Native 0.76), TypeScript
- `@supabase/supabase-js` — `rail3-staging` project `xybgtbybdhxuwqjfcfkc` (NOT
  prod — see `docs/rail3-staging.md`)
- AsyncStorage session storage, PKCE flow, deep-link magic-link return
- React Navigation (native-stack) auth gate
- Distributed as an **Expo Dev Build** sideloaded APK — no Play Store (SD-003)

## Prerequisites

- Node 18+ and npm
- An Android device with **USB debugging** enabled (or an emulator)
- For cloud builds: an Expo account + `npm i -g eas-cli` then `eas login`
- For local builds: Android Studio + SDK + a connected device/emulator

## 1. Configure environment

**EAS cloud builds need no setup here** — the `EXPO_PUBLIC_*` values are committed
in `eas.json` → `build.<profile>.env` (step 4), so `eas build` is self-configuring.

A local `.env` is only needed for **local dev** (`npx expo start` / `expo
run:android`), which reads `.env` rather than `eas.json`:

```sh
cd mobile
cp .env.example .env
# .env.example already has the rail3-staging URL + EXPO_PUBLIC_TENANT_SLUG;
# set EXPO_PUBLIC_SUPABASE_ANON_KEY to the staging publishable key.
```

`EXPO_PUBLIC_*` vars are inlined at build time. `.env` is gitignored; the anon key
is the staging project's **publishable** key (`sb_publishable_…`, matching the web
app's key format) — get it from **Supabase → rail3-staging → Project Settings → API
Keys**, or have the Sr PM hand it over.

## 2. Install dependencies

```sh
npm install
```

## 3. Supabase Auth redirect allowlist (required for magic link)

The magic-link email must redirect back into the app via its deep link. Add the
app's redirect URL to **Supabase → Authentication → URL Configuration → Redirect
URLs**:

- Dev Build / standalone: `rail3://auth`
- `expo start` (dev): the `exp://…/--/auth` URL printed by `npx expo start`

Without this, the link opens but Supabase rejects the redirect and no session is
established. (Per-tenant/web redirect handling is a separate concern — the Rail 3
deep-link scheme is additive to the existing web allowlist.)

## 4. Build the app (EAS cloud build)

Two `eas.json` profiles, both `distribution: internal` (installable APK, no Play
Store — SD-003). The non-secret `EXPO_PUBLIC_*` values (staging URL, publishable
key, tenant slug) are committed in `eas.json` → `build.<profile>.env`, so cloud
builds are **self-configuring** — no `eas env:create`, no uploaded `.env`. (The
anon value is a *publishable* key — public by design, it ships in every APK
regardless; only the DB password and `service_role` key stay out of the repo.)

| Profile | `developmentClient` | JS bundle | Use it for |
|---|---|---|---|
| `preview` | no | baked into the APK | **UAT / field testing** — install and run, nothing on your machine |
| `development` | yes | served by Metro at runtime | day-to-day dev with hot-reload (needs `expo start`) |

**Recommended for UAT — `preview` (self-contained, simplest):**

```sh
npm i -g eas-cli          # once
eas login                 # your Expo account
cd mobile
eas init                  # first time — writes expo.extra.eas.projectId into app.json
eas build --profile preview --platform android
```

The build runs in the cloud (~10 min). When it finishes EAS prints a **build-details
URL + QR code** (also at <https://expo.dev> → project → Builds). A `preview` APK has
the JS baked in, so once installed it runs on its own — no bundler, no tunnel.

**For ongoing dev — `development` (dev client + Metro):**

```sh
eas build --profile development --platform android   # or: npx expo run:android (local)
```

A dev-client build loads its JS from a running bundler, so after installing you also
run `npx expo start --dev-client` (add `--tunnel` if the device can't reach your
machine on the LAN — e.g. from WSL). Use this only when you need hot-reload or the
native modules that later Rail 3 tasks add.

## 5. Install on the test device & verify — S0-004

`distribution: internal` means EAS serves the APK behind an install page reachable
by QR — no Play Store, no iOS-style device registration.

1. On the **Android device**, scan the QR EAS printed (terminal or expo.dev →
   Builds → this build → **Install**).
2. The QR opens the install page → tap **Install/Download** → Chrome downloads the
   `.apk`. (Or download the APK to your machine and `adb install -r app.apk`.)
3. Tap the APK; allow **"install from unknown sources"** if Android prompts
   (Settings → Apps → special access — one-time per source). **Vechelon Rail 3**
   appears in the launcher.
4. Open the app:
   - **`preview` build:** runs immediately.
   - **`development` build:** start `npx expo start --dev-client` (`--tunnel` on
     WSL) and open the app to load the bundle.
5. Sign in: enter your email → a **`[Rail 3 TEST]`**-branded email arrives (staging
   `send-magic-link` + Resend). Tap the link **on the device** → it returns via the
   `rail3://auth` deep link → you land on **Home**. (Deep-link return wired in W188.)

> **Heads-up:** the free `rail3-staging` project **pauses after ~7 days idle** —
> wake it in the Supabase dashboard before a test session, or magic-link sign-in
> fails. The build itself (no Supabase calls) is unaffected.

## Verifying W168 acceptance criteria

| Criterion | How to verify |
|---|---|
| App runs on Android via Dev Build | Steps 4–5 above |
| Magic-link sign-in works end-to-end | Enter email → open link on device → lands on Home |
| Session persists across cold start | Sign in, kill the app, reopen → still signed in (no sign-in screen) |
| Base navigation gates protected routes | Signed out shows SignIn; signed in shows Home; Sign Out returns to SignIn |
| Sideload process documented | This section + step 5 |

## Project layout

```
mobile/
├─ App.tsx                     providers, AppState auto-refresh, deep-link handling
├─ index.ts                    Expo entry
├─ app.json / eas.json         Expo + EAS (dev build) config
├─ .env.example                EXPO_PUBLIC_SUPABASE_* template
└─ src/
   ├─ lib/
   │  ├─ env.ts                reads EXPO_PUBLIC_* env
   │  ├─ supabase.ts           RN client (AsyncStorage, PKCE, detectSessionInUrl:false)
   │  └─ deepLinkAuth.ts       magic-link URL → session; auth redirect URL
   ├─ auth/AuthContext.tsx     session state + sign-out (global scope)
   ├─ navigation/RootNavigator.tsx   auth gate
   └─ screens/
      ├─ SignInScreen.tsx      email → magic link
      └─ HomeScreen.tsx        authed placeholder + sign out
```
