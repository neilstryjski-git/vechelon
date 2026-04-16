-- W72: Add meetup_coords and meetup_label to rides table
-- meetup_coords stores where riders gather (may differ from GPX start_coords)
-- meetup_label stores the human-readable name of the gathering point

ALTER TABLE rides
  ADD COLUMN IF NOT EXISTS meetup_coords point,
  ADD COLUMN IF NOT EXISTS meetup_label  text;
