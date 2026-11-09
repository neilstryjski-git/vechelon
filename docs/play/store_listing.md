# Google Play: store listing copy (W304 draft for Sr PM approval)

Paste into Play Console → Grow → Store presence → Main store listing. The limits are
Play's: app name 30 characters, short description 80, full description 4,000.

Rules this copy follows:
- The brand is "Vechelon", with normal capitalisation.
- It doesn't name any industry or sector.
- It describes location the way the app actually works, verified against staging on
  2026-11-09. Live positions go to the ride group only while a ride is active, and no route
  history is kept per rider. The server does hold three things: each rider's latest
  position during a ride (`ride_participants.last_lat/long`), the Beacon location
  (`beacon_alerts.lat/long`), and the ride leader's route (`rail3_breadcrumb`, purged after
  4 hours). So the copy must NOT say "never stored". Retention per D100: within 5 hours of
  the ride ending (Beacon location: 30 days).
- Use is club-gated: anyone can install, but riding with a club needs that club's approval.

---

## App name (30 max)

> Vechelon

## Short description (80 max)

> Group rides for cycling clubs. See your ride live. Club membership required.

(76 characters)

## Full description

> **Vechelon keeps your club's group ride together.**
>
> When your ride starts, everyone in it shows up on one live map. You can see who's
> ahead, who's dropped off the back and where the Captain is. There's no group chat to
> scroll and nobody needs to shout "car back" down the line to find out who's missing.
>
> **Made for clubs, not strangers**
> Vechelon is for members of a cycling club that uses it. You need to be a member of
> that club to see its rides. After you sign in, your club organiser approves your
> membership. Until they do, you'll see that your membership is pending and none of the
> club's rides or riders.
>
> Open testing is running now with **Racer Sportif**. If you're not a Racer Sportif
> member, you'll join our **Bikes and Beers** test club as a pending member until an
> organiser approves you.
>
> **On the ride**
> - A live map of everyone in your ride, while the ride is on
> - Club organisers can start a ride on the spot, and any Captain can end it when
>   everyone's home
> - A Beacon lets a rider signal they need help, so the group knows to look for them
>
> **Your location, plainly**
> - Vechelon uses your location only while you're in an active ride. It's shared live
>   with the other riders in that ride.
> - To keep you on the map when your phone is in a pocket or jersey, Vechelon asks for
>   background location. It always explains why first, and you can say no. Android shows
>   a notification the whole time tracking is on.
> - Vechelon doesn't keep a history of your rides. It holds your latest position, so
>   your Captain can find you if your phone goes quiet. If you raise a
>   Beacon, it records where you raised it, so the group knows where to look. The ride
>   leader's route is shown to the group. Your last position and the leader's route are
>   deleted within 5 hours of the ride ending, and a Beacon location after 30 days.
>   Tracking stops when the ride ends.
>
> **Signing in**
> No passwords. Enter your email and we'll send you a one-time code.
>
> **Your account, your call**
> You can delete your account and its data from inside the app, or at
> vechelon.productdelivered.ca/delete-account.

---

## Open questions for the Sr PM

0. **Retention: DECIDED 2026-11-09 (option C, D100).** Last position and leader route are
   deleted within 5 hours of the ride ending, and Beacon location after 30 days. privacy.html
   is amended to match, and the line above states it.

1. **Naming the clubs.** The ticket asks for Racer Sportif and Bikes and Beers to be
   named. Does Racer Sportif agree to be named in a public listing?
2. **"Car back".** This is cycling-native wording, but it's playful. Keep it or cut it?
3. **Beacon.** The line describes it as a help signal to the group. Confirm that matches
   how Beacon should be positioned publicly before Voice & Tone signs off the Beacon copy.
