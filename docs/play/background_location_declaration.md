# Google Play: background location declaration + demo video (W225)

Paste into Play Console → App content → Sensitive permissions → Location permissions
(ACCESS_BACKGROUND_LOCATION). Every answer below describes what the app actually does on
rail3-integration, verified 2026-11-10 against the code. The text that appears on the
device is quoted exactly.

---

## Declaration answers

**Which feature uses background location?**

> Live group-ride map. While a club ride is active, Vechelon shares each rider's position
> with the ride's Captain and support crew so they can keep the group together, see who
> has dropped off the back, and find a rider who needs help.

**Why does it need location in the background?**

> Cyclists ride with the phone in a jersey pocket and the screen off for the whole ride.
> If location stopped when the screen locks, a rider would vanish from the Captain's map
> within seconds, which is exactly when the Captain needs to see them (a dropped rider, a
> crash, a mechanical). Background location runs only while the rider is in an active
> ride, and it stops when the ride ends.

**How is the user told?**

> Before any background permission request, the app shows a full-screen disclosure with two
> explicit choices (Allow / Not now). It states: "Vechelon collects location data to show
> your position to your club during a ride, even when the app is closed or not in use."
> Choosing "Not now" requests no permission, and the ride continues with foreground-only
> location. While tracking runs, Android shows a persistent notification ("Vechelon —
> sharing your position").

**Could the feature work without background location?**

> No. Riders can't keep the screen on and the app open for a multi-hour ride. Without
> background location, the core safety function (the Captain finding a rider who has
> fallen behind or needs help) fails during the ride.

**Video link:** `<unlisted YouTube URL>`

---

## Demo video shot list (target 60–90 seconds, portrait, no narration needed)

Requirements:
- Use a **licensed release build** (the EAS validate or production build), not a dev build.
  Background tracking only runs in a licensed build.
- Use a **fresh install**, or clear the app's location permission first (Settings → Apps →
  Vechelon → Permissions → Location → Don't allow), so the first-time prompts appear.
- Use **two phones**. Phone A is the rider being filmed. Phone B is the Captain's view,
  which shows that A keeps updating with its screen off.
- This is a short walk to show the permission flow, not a field ride test.

Shots, in order:
1. **Phone A:** open Vechelon (signed in as a club member) and join the active ride that
   Phone B (Captain) started.
2. **Phone A:** the "Keep your ride visible" explainer appears. Tap "Got it".
3. **Phone A:** the Android location prompt. Choose "While using the app". It may already
   have appeared when the ride opened; if so, it won't appear again here.
4. **Phone A: the disclosure screen.** Hold for about 3 seconds so the full sentence is readable:
   "Vechelon collects location data to show your position to your club during a ride, even
   when the app is closed or not in use." Then tap **Allow**.
5. **Phone A:** the "Stay on the map when pocketed" dialog appears. Tap **Open Settings**,
   then Permissions → Location → **"Allow all the time"**, then go back to the app. (On
   Android 11+ the system only offers "Allow all the time" from Settings.)
6. **Phone A:** pull down the notification shade and show "Vechelon — sharing your position".
7. **Phone A:** lock the screen and put the phone away. Walk.
8. **Phone B (Captain):** film Phone A's marker moving on the map while Phone A stays locked
   (about 20–30 seconds).
9. **Phone B:** End Ride. **Phone A:** unlock it. The ride has ended and the notification
   is gone.

Upload as **Unlisted** on YouTube and paste the link above and into the declaration.
