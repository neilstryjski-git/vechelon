# Vechelon Rail 3 — Mobile Tactical (PoC)

React Native **Expo** app (managed workflow) for the Rail 3 PoC. Android-only for
the PoC (iOS excluded — SD-004). This task (**W168**) is the authenticated shell:
Supabase magic-link sign-in, session persistence, and an auth-gated navigation
base. Feature surfaces (fleet map, Support Beacon, ride controls) land in later
Rail 3 tasks.

Bedrock trace: Pillar II §1 (PoC), §2 (Stack); LOE §4; ledger S0-004.

## Stack

- Expo SDK 52 (React Native 0.76), TypeScript
- `@supabase/supabase-js` — shared Vechelon project `drktcxggaizkbvqccfhp`
- AsyncStorage session storage, PKCE flow, deep-link magic-link return
- React Navigation (native-stack) auth gate
- Distributed as an **Expo Dev Build** sideloaded APK — no Play Store (SD-003)

## Prerequisites

- Node 18+ and npm
- An Android device with **USB debugging** enabled (or an emulator)
- For cloud builds: an Expo account + `npm i -g eas-cli` then `eas login`
- For local builds: Android Studio + SDK + a connected device/emulator

## 1. Configure environment

```sh
cd mobile
cp .env.example .env
# edit .env — set EXPO_PUBLIC_SUPABASE_ANON_KEY (URL is already the shared project)
```

`EXPO_PUBLIC_*` vars are inlined at build time. Never commit `.env` (gitignored).

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

## 4. Build & run a Dev Build

A Dev Build (not Expo Go) is mandatory — background GPS and other native modules
in later tasks cannot run in Expo Go.

**Local (fastest if Android Studio is set up):**

```sh
npx expo run:android        # builds the dev client and installs to the device
```

**Cloud (no local Android toolchain needed):**

```sh
eas build --profile development --platform android
# download the APK from the EAS build page, then sideload it (step 5)
```

Then start the bundler and connect the device:

```sh
npx expo start --dev-client
```

## 5. Sideload the APK onto a test device (S0-004)

1. Download the `.apk` from the EAS build (or find the locally built APK).
2. Transfer it to the device (USB, or `adb install path/to/app.apk`).
3. On the device, allow "install from unknown sources" if prompted.
4. Open **Vechelon Rail 3**, then run `npx expo start --dev-client` on your
   machine and scan/enter the dev URL to load the JS bundle.

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
