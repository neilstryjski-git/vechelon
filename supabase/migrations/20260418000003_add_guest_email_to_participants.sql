-- Add email column to ride_participants to capture guest RSVP contact info.
ALTER TABLE ride_participants ADD COLUMN email TEXT;
