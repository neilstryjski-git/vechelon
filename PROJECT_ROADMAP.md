**Project:** Vechelon
**Current Version:** v1.8.0
**Last Sync Date:** 2026-11-15
**Status:** COMMITTED

| Version | Date | Time | MACD Action | Decision | Lead |
|---------|------|------|-------------|----------|------|
| v1.8.0  | 2026-11-15 | — | CHANGE | Sync to current status — Android app submitted to Google Play (open test, in review, 2026-11-14); Rail 3a Sprint 1 built, ride testing pending; account deletion, retention deadlines, privacy policy and Terms shipped; security audit closed; member onboarding features shipped; hosting moved to Cloudflare | PM |
| v1.7.0  | 2026-06-15 | — | CHANGE | Sync to current status — Android Tactical PoC in field test; Multi-Club at 3 live tenants; VoC + Innovation Accounting shipped; web Race Control added | PM |
| v1.5.0  | 2026-04-21 | 14:30 | CHANGE | Pivot to Value-Driven Roadmap (Theme Buckets + Active Picks) | PM |

# Vechelon Strategic Roadmap

## 🎯 Active Value Set (Next Release)
*The specific high-impact features currently being pulled from our strategic themes.*

- [ ] **Android Tactical — open test → public release** (from *Android/iOS Tactical* theme)
    - [x] Live fleet tracking map
    - [x] Support Beacon — one-tap alert
    - [x] Captain mobile controls
    - [x] Rider states & edge indicators
    - [x] Ad-hoc ride creation on the road
    - [x] One app for every club — club resolved from the rider's membership at sign-in (W303/W304)
    - [x] Prominent location disclosure and in-app account deletion (W302, W300)
    - [x] Submitted to Google Play — open testing track, 2026-11-14 (W305; in Google review, staging-backed)
    - [~] Rail 3a Sprint 1 (W279–W293) — roster, offline roster cache, self-health indicator, any-Captain End Ride, departure marking, breadcrumb honesty: built and in the store build, ride testing pending
    - [ ] Background GPS for pocket-and-locked use (field-hardening gate; D88/D90 open)
    - [ ] Real-time scaling — two-channel role-scoped Broadcast (bounds O(N²) fan-out)
    - [ ] Production move — Rail 3 schema and app onto the production backend (W259), then public release
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
- [x] Web Race Control — live fleet view (PoC on staging; W190/W192, not yet on production)
- [x] Bulk member import via CSV (W216)
- [x] Phone-only member onboarding and member-data hygiene (G31)
- [x] Guest RSVP → member conversion (W230)
- [x] Rider self-cancel RSVP (W248)
- [x] Change a ride's GPX route on Edit Ride
- [x] Self-service account deletion, web and app (W299–W301)
- [x] Location retention deadlines, privacy policy and Terms of Service (D100)
- [x] Security audit findings closed (D96, 2026-11)
- [x] Hosting migration to Cloudflare (G35, complete 2026-11-14)
- [ ] UAT with Racer Sportif (ongoing — iterative defect loop is the new normal)

### Multi-Club (The Tenant Era)
- [x] Shared Supabase Backend & RLS Policies
- [x] Platform Admin role (admin.vechelon.ca)
- [x] Cross-club email validation
- [x] Subdomain routing (clubname.vechelon.ca)
- [x] Multi-tenancy hardening audit
- [x] Additional clubs onboarded and live alongside Racer Sportif
- [ ] Self-serve onboarding (Phase 2)
- [ ] Multi-membership support (Phase 2)
- [ ] Self-serve branding portal (Phase 2)

### Android/iOS Tactical (The Live Ride)
- [x] Real-time Support Beacon loop
- [x] Tactical presence mapping (live fleet map)
- [x] Captain mobile controls
- [x] Rider states & edge indicators
- [x] Ad-hoc ride creation on the road
- [x] Android PoC field-tested with Racer Sportif
- [x] Android app submitted to Google Play — open test, in review (2026-11-14)
- [~] Rail 3a Sprint 1 hardening — built, ride testing pending
- [ ] Background GPS (pocket/locked) — production-critical hardening gate
- [ ] Real-time scaling (two-channel role-scoped Broadcast)
- [ ] iOS parity & App Store distribution (post-Android, Rail 3b)

### Club Growth & Intelligence
- [x] Voice of Customer feedback loop (schema, GitHub Issues, label set)
- [x] Rider Share — viral growth loop
- [x] Innovation Accounting — H1–H5 adoption hypotheses instrumented end-to-end
- [ ] Ride history on profiles
- [ ] Observer role
- [ ] Member-uploaded routes (GPX)
- [ ] Strava sync & club analytics
