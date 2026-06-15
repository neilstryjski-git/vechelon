**Project:** VEcheLOn
**Current Version:** v1.7.0
**Last Sync Date:** 2026-06-15
**Status:** COMMITTED

| Version | Date | Time | MACD Action | Decision | Lead |
|---------|------|------|-------------|----------|------|
| v1.7.0  | 2026-06-15 | — | CHANGE | Sync to current status — Android Tactical PoC in field test; Multi-Club at 3 live tenants; VoC + Innovation Accounting shipped; web Race Control added | PM |
| v1.5.0  | 2026-04-21 | 14:30 | CHANGE | Pivot to Value-Driven Roadmap (Theme Buckets + Active Picks) | PM |

# VEcheLOn Strategic Roadmap

## 🎯 Active Value Set (Next Release)
*The specific high-impact features currently being pulled from our strategic themes.*

- [ ] **Android Tactical PoC — field test → rollout** (from *Android/iOS Tactical* theme)
    - [x] Live fleet tracking map
    - [x] Support Beacon — one-tap alert
    - [x] Captain mobile controls
    - [x] Rider states & edge indicators
    - [x] Ad-hoc ride creation on the road
    - [ ] Background GPS for pocket-and-locked use (field-hardening gate)
    - [ ] Real-time scaling — two-channel role-scoped Broadcast (bounds O(N²) fan-out)
- [ ] **Web Race Control** (from *Club Command* theme) — follow the live fleet from HQ on the web; role-derived spectator view scoped for production.
- [ ] **iOS Tactical prep** (from *Android/iOS Tactical* theme) — Apple Developer enrolment + background-GPS validation, post-Android.

## 🏗️ Strategic Themes (Value Buckets)
*Our long-term architectural and market objectives. Features are "picked" from these buckets for each release.*

### Club Command
- [x] Initial design and logo
- [x] "Coming Soon" hero section
- [x] Admin Desktop "Velo Modern" Design System
- [x] Captain & Support designation
- [x] Automated ride close & data purge
- [x] Web Race Control — live fleet view (PoC; W190/W192)
- [ ] UAT with Racer Sportif (ongoing — iterative defect loop is the new normal)

### Multi-Club (The Tenant Era)
- [x] Shared Supabase Backend & RLS Policies
- [x] Platform Admin role (admin.vechelon.ca)
- [x] Cross-club email validation
- [x] Subdomain routing (clubname.vechelon.ca)
- [x] Second & third club onboarding (Bikes & Beers, Lakeside Wheelers — live alongside Racer Sportif)
- [ ] Self-serve onboarding (Phase 2)
- [ ] Multi-membership support (Phase 2)
- [ ] Self-serve branding portal (Phase 2)

### Android/iOS Tactical (The Live Ride)
- [x] Real-time Support Beacon loop
- [x] Tactical presence mapping (live fleet map)
- [x] Captain mobile controls
- [x] Rider states & edge indicators
- [x] Ad-hoc ride creation on the road
- [~] Android PoC in field test with Racer Sportif
- [ ] Background GPS (pocket/locked) — production-critical hardening gate
- [ ] Real-time scaling (two-channel role-scoped Broadcast)
- [ ] iOS parity & App Store distribution (post-Android, Rail 3b)

### Club Growth & Intelligence
- [x] Voice of Customer feedback loop (schema, GitHub Issues, label set)
- [x] Rider Share — viral growth loop
- [x] Innovation Accounting — H1–H5 adoption hypotheses instrumented end-to-end
- [x] Multi-tenancy hardening audit
- [ ] Ride history on profiles
- [ ] Observer role
- [ ] Member-uploaded routes (GPX)
- [ ] Strava sync & club analytics
