-- Allow public reads of rides for RSVP landing pages.
-- Ride UUIDs are unguessable; name/date/location are intentionally shareable via the QR/invite link.
-- This replaces the dev_public_select_rides bypass that was removed in 20260418000001.
CREATE POLICY ride_public_select ON rides
    FOR SELECT USING (true);
