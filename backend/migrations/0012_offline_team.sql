-- The event team without internet, beyond the cash desk (0011): intake actions done
-- offline are replayed through the same functions once online, and the seller's ID
-- QR code works without connection.

-- One offline action of the team, e.g. accepting an item; the ID comes from the app, so
-- an action sent twice is done once. `error` is set when the backend refused it then
-- (the item was withdrawn meanwhile, the seller already paid out); the team settles it.
CREATE TABLE offline_actions (
  id uuid PRIMARY KEY,
  event_id uuid NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  -- The function and its arguments, e.g. eventProducts.updateProductStatus
  name text NOT NULL,
  args jsonb NOT NULL,
  -- What the app showed, e.g. the item title
  label text NOT NULL,
  -- When it was done on the device
  done_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  error text,
  error_message text,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES users (id) ON DELETE SET NULL
);
CREATE INDEX offline_actions_failed_idx ON offline_actions (event_id) WHERE error IS NOT NULL;

-- Key of the time-based code in the ID QR code (TOTP): the seller's phone computes it
-- without connection, the team's devices check it with the keys of their event's sellers.
ALTER TABLE users ADD COLUMN check_in_secret bytea;
