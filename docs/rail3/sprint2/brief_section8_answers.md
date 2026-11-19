# Sprint 2 brief §8: answers for the Decision Brief

Items 1, 2, 4 and 5 are answered under W316. Item 3 is answered here by W310.

## 3. What travels on the public web channel

**Nothing. No code used it, and it has now been removed.**

- The public channel was `ride:<ride id>`, opened without authorisation.
- It had one subscriber, `admin/src/hooks/useRideRealtime.ts`, and one sender,
  `admin/src/lib/simulation.ts`. Neither was imported by any page, component, store or test,
  on the trunk, on `master`, or on the unmerged Race Control branches. Both dated from the
  first web build (commits `7454760`, `a311715`) and were never wired in.
- The mobile app, the edge Worker and the edge functions never named the channel.
- What the dead code would have carried, had it run: `location_update`
  `{ id, displayName, lastLat, lastLong, beaconActive }`, and `beacon_fired` /
  `beacon_cancelled` `{ participantId }`. A name and a position on an open channel is exactly
  what §4.1 denies, so the code is deleted, not kept for later.
- Production web: the same two files are on `master` and equally unused, so nothing was
  exposed in production. They leave production web when the trunk is promoted.

W310 removed both files. Rule T15 now has a test (`T15.1`) that fails if any app source opens
a realtime channel without `private: true` or names a `ride:` topic.

### Two things the Brain and the Senior PM should know

1. **The Realtime service still relays public channels.** Both projects allow them
   (`private_only` is unset on staging and on production). Nothing in the product uses one, but
   anyone holding the publishable key can still open a public channel of any name and talk to
   themselves on it. Setting `private_only` closes that. It is a project setting, safe for the
   Play build (the app only uses private channels), and the advisory test `T15.2` turns green
   when it is set. Recommended for both projects; it is the Senior PM's call and it is not
   applied here.
2. **Web Race Control is not on the trunk.** `admin/src/pages/RaceControl.tsx` and its hooks
   exist only on two unmerged branches, `W192` and `w273-web-lastknown` (27 and 29 commits of
   their own, 387 behind the trunk). They use the private `rail3:ride:<id>` channel, not the
   public one. So W310 could not break Race Control, and equally there is no Race Control on
   the trunk for W193's club-admin channel access to be exercised by. T8 proves the
   server side with a club admin's token; the web page itself is outside this sprint's code.
