# Google Play — App Access instructions (W303 draft, re-checked for W304)

Paste into Play Console → App content → App access → "All or some functionality is
restricted" → Add instructions. The **password is not in this file**: copy it from
`~/.vechelon-play-reviewer.txt` (Sr PM's machine) straight into the Password field.

- **Name:** Reviewer sign-in
- **Username:** play-review@vechelon.ca
- **Password:** *(from the local reviewer file — never commit it)*
- **Any other information:**

> Vechelon is a group-ride app for cycling clubs; riders normally sign in with a one-time
> code emailed to them. The reviewer account above signs in with a password instead:
>
> 1. Open the app, type **play-review@vechelon.ca** in the email field and tap **Send Code**.
>    No email is sent for this account — the next screen asks for a password.
> 2. Enter the password and tap **Verify & Sign In**.
> 3. You are now an organiser of the **Bikes and Beers — Reviewer Edition** club. Tap **Create Ad Hoc Ride**
>    to start a demo ride, then open it under **Live rides**.
> 4. When the ride opens, the app explains why it needs your location and asks for
>    consent before requesting background location ("Allow" / "Not now"). Location is
>    shared live with the club only while a ride is active.
>
> This reviewer club contains no real riders. Other people who install the app join a
> separate club as pending members until a club organiser approves them.

**W304 re-check (2026-11-09):** the reviewer path is unchanged. The reviewer is an
*affiliated* organiser of the reviewer club, so the W304 rule that only affiliated
members see club data doesn't affect it. A stranger who signs in sees the
"Membership pending" screen (Bikes and Beers) until an organiser approves them, which
matches the last paragraph above.

