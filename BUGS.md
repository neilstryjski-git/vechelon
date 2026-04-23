# VEcheLOn Bug Tracker

## Active Bugs
- No known active bugs.

## Resolved Bugs

| Bug / Task | Fix Summary | Date |
|---|---|---|
| **W95-W101** (MVE Phase II) | Hardened the Rider Experience: Silent Magic Links, Deep-Linking, Emergency Safety Schema, and Viral Guest visibility. | 2026-04-23 |
| **E1** (Edge Function Robustness) | Fixed missing `getAIProvider` export in `_shared/ai-provider.ts`, added CORS methods to `generate-ride-summary`, and improved error diagnostic reporting in the Admin/Rider portals. | 2026-04-23 |
| **W2** (Polished Situational Grid) | Updated \"EXPLORE THE TACTICAL LOGIC\" link, added 
 \"VISUAL\" header, and set divider opacity to 0.4. | 2026-03-29 |
| **W16** (Velo Modern Design System) | Implemented full design system in Admin Desktop, including Tailwind v4 theme, Tonal Layering, Calendar Grid, and Dashboard. | 2026-04-11 |
| **D1** (Production Deployment) | Resolved asset 404s and SPA routing issues in Vercel using `handle: filesystem` and simplified rewrites. | 2026-04-12 |
| **D2** (GPX Schema Sync) | Fixed \"out of sync\" errors by consolidating migrations and forcing PostgREST cache reloads. | 2026-04-12 |
| **T1** (Tenant Resolution) | Implemented Global Tenant Override in `useAppStore` to force Racer Sportif tenant ID, stabilizing production for the prototype. | 2026-04-12 |
| **U1** (Logo Positioning) | Restored Racer Sportif logo to far-left and unified branding area with dynamic Supabase assets. | 2026-04-12 |
| **U2** (Upload Robustness) | Added 30s timeout and Web Crypto safety checks to prevent indefinite hangs during GPX uploads. | 2026-04-12 |
| **D3** (Build Pipeline) | Fixed TypeScript build error (unused variable) and implemented `npm workspaces` to stabilize Vercel deployments. | 2026-04-12 |
| **D4** (Vercel Deployment) | Switched output directory to `dist_production` to resolve folder collision/missing folder errors in Vercel. | 2026-04-12 |
| **P1** (Proxy Hang) | Fixed `createSafeProxy` in `supabase.ts` to correctly handle `then` property, preventing indefinite hangs when environment variables are missing. | 2026-04-13 |
| **P2** (Prod Build Sync) | Rebuilt admin portal with correct environment variables and synchronized `public/` and `dist_production/` to ensure working deployment. | 2026-04-13 |
| **W61** (GPX Extraction Bridge) | Implemented robust GPX coordinate extraction in RideFormModal, ensured coordinates and labels are passed to and persisted in RideBuilder, and improved map fit-bounds behavior. | 2026-04-14 |
| **W63** (Resend SMTP Integration) | Wired up Resend as transactional email provider for Edge Functions (e.g. member invitations) to ensure professional branding and deliverability. | 2026-04-15 |
| **W64** (Anonymous Join) | Enabled unauthenticated "Join as Guest" functionality in `RideLanding` using persisted `sessionCookieId`. | 2026-04-15 |
| **U3** (Roadmap Polish) | Fixed Android/Apple logo rotations, reoriented hero chainring behind wordmark, and added Irish Green color picker. | 2026-04-21 |
| **U4** (Roadmap Deploy) | Moved roadmap to `/roadmap` path and added "VIEW ROADMAP" link to marketing page. | 2026-04-21 |
| **S1** (RLS Security) | Hardened database security by explicitly enabling RLS on all public tables and dropping stray "dev bypass" policies identified by Supabase Linter. | 2026-04-21 |

