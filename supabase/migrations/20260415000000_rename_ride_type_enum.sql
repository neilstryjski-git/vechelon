-- MVE: Rename ride_type 'scheduled' → 'route' and add 'meetup'
-- Rationale: 'scheduled' described when the ride happens, not what kind of ride it is.
-- Both Route Rides and Meetup Rides are scheduled — the distinction is whether the route
-- is predefined. 'route' is self-documenting; 'meetup' covers rides where the group
-- decides the route in the parking lot.
-- PostgreSQL renames enum values in-place — existing rows update automatically.

ALTER TYPE ride_type RENAME VALUE 'scheduled' TO 'route';
ALTER TYPE ride_type ADD VALUE IF NOT EXISTS 'meetup';
