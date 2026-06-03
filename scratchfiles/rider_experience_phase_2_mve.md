**Project:** VEcheLOn
**Current Version:** v1.1.0
**Last Sync Date:** 2026-04-23
**Status:** COMMITTED

| Version | Date | Time | MACD Action | Decision | Lead |
|---------|------|------|-------------|----------|------|
| v1.0.0  | 2026-04-23 | 14:00 | ADD | Initial commit of Phase II MVE spec | PM |
| v1.1.0  | 2026-04-23 | 15:30 | CHANGE | Expanded to 7 features including Deep-Linking and Viral Guest Flow | PM |

# MVE Phase II: The Rider Experience (Action Plan)

## 1. Safety Schema (P0)
*   **Goal:** Align the database with the mandatory safety requirements in Pillar II.
*   **Action:** Add `emergency_contact_name` and `emergency_contact_phone` to the `accounts` table.
*   **UI:** Update the Profile page to include these as required editable fields.

## 2. Silent Token Exchange
*   **Goal:** Remove the "Enter the Portal" button workaround for a friction-less entry.
*   **Action:** Modify the `send-magic-link` Edge Function to point directly to the auth route.
*   **Tech:** Use client-side JavaScript in `AuthPage.tsx` to exchange the Supabase token for a session automatically on land.

## 3. Contextual Deep-Linking
*   **Goal:** Ensure users land exactly where they intended (e.g., a shared ride) after logging in.
*   **Action:** Persist the `redirectTo` URL through the magic link email flow.
*   **User Flow:** Click Shared Ride → Auth → Land on Ride Card.

## 4. Enrollment Intelligence
*   **Goal:** Provide a "Red Carpet" experience for low-friction clubs.
*   **Action:** Update the `ensure_account_exists` RPC to check the club's `enrollment_mode`.
*   **Logic:** If `open`, grant `affiliated` status immediately on first sign-in.

## 5. Dynamic Branding
*   **Goal:** Maintain professional "White Label" identity throughout the rider journey.
*   **Action:** Inject Tenant Logo and CSS Colors into the `AuthPage` (before login) and the `RiderLayout` shell.

## 6. RSVP Tier Guarding
*   **Goal:** Protect the value of full membership and maintain enrollment integrity.
*   **Action:** Update the RSVP button logic to check for `Tier 3 (Affiliated)` status.
*   **UX:** Tier 2 (Initiated) users see the ride details but are informed they need "Tactical Activation" to RSVP.

## 7. Viral Guest Flow (Public Ride Visibility)
*   **Goal:** Use shared rides as a growth engine for the club.
*   **Action:** Audit and polish `RideLanding.tsx` to ensure Guests (Tier 1) can see all logistics (Start/Finish/GPX) and use the "Join as Guest" flow.
*   **BDD:** Given a guest clicks a shared link, they land directly on the ride card with all details visible.
