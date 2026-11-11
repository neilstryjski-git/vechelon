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

**Video link:** https://youtu.be/56HKtCnGRxg (Unlisted; uploaded 2026-11-10)

---

## Demo video shot list (30 seconds or less, portrait, no narration needed)

Google's guidance (Play Console Help, "Understanding location in the background
permissions", https://support.google.com/googleplay/android-developer/answer/9799150):
- keep it to 30 seconds or less
- film it on an Android device
- show the in-app disclosure, the runtime permission prompt, and the feature working with
  the app in the background
- share it as a YouTube link (or a Drive link to an MP4) that reviewers can open

Requirements:
- Use a **licensed release build** (the EAS validate or production build), not a dev build.
  Background tracking only runs in a licensed build.
- Use a **fresh install**, or clear the app's location permission first (Settings → Apps →
  Vechelon → Permissions → Location → Don't allow), so the first-time prompts appear.
- Use **two phones**. Phone A is the rider being filmed. Phone B is the Captain's view,
  which shows that A keeps updating with its screen off.
- Rehearse once before filming, then cut any dead time (waiting for GPS, typing) in the edit.
- This is a short walk to show the permission flow, not a field ride test.

Shots, in order (rough seconds):
1. **Phone A (3s):** join the active ride that Phone B (Captain) started. Tap "Got it" on the
   "Keep your ride visible" explainer.
2. **Phone A (3s):** the Android location prompt. Choose "While using the app". It may already
   have appeared when the ride opened; if so, it won't appear again here.
3. **Phone A (5s): the disclosure screen.** Hold long enough to read the sentence:
   "Vechelon collects location data to show your position to your club during a ride, even
   when the app is closed or not in use." Then tap **Allow**.
4. **Phone A (6s):** the "Stay on the map when pocketed" dialog. Tap **Open Settings**, then
   Permissions → Location → **"Allow all the time"**, then go back to the app. (On Android 11+
   the system only offers "Allow all the time" from Settings.)
5. **Phone A (3s):** pull down the notification shade and show "Vechelon — sharing your
   position". Lock the screen.
6. **Phone B (10s):** Phone A's marker keeps moving on the Captain's map while Phone A stays
   locked in a pocket.

Upload as **Unlisted** on YouTube and paste the link above and into the declaration.
