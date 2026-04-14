-- Sync profile changes to active ride_participants
-- When a member updates their name or phone in the accounts table,
-- propagate the change to ride_participants rows for rides that haven't ended.

CREATE OR REPLACE FUNCTION sync_account_to_participants()
RETURNS TRIGGER AS $$
BEGIN
  -- Only update if name or phone actually changed
  IF NEW.name IS DISTINCT FROM OLD.name OR NEW.phone IS DISTINCT FROM OLD.phone THEN
    UPDATE ride_participants rp
    SET
      display_name = COALESCE(NEW.name, rp.display_name),
      phone        = NEW.phone
    FROM rides r
    WHERE rp.ride_id       = r.id
      AND rp.account_id    = NEW.id
      AND r.status         NOT IN ('completed', 'cancelled');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_account_to_participants ON accounts;

CREATE TRIGGER trg_sync_account_to_participants
  AFTER UPDATE OF name, phone ON accounts
  FOR EACH ROW
  EXECUTE FUNCTION sync_account_to_participants();
