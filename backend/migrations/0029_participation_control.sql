-- Organizers control who and what takes part in their bazaar (#252).

-- A seller the organizer took out of the bazaar. They cannot join again, also not with
-- the access code or an invitation, until the organizer takes the exclusion back. Only
-- sellers with an account: walk-in sellers belong to the bazaar anyway.
CREATE TABLE event_exclusions (
  event_id uuid NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  excluded_by uuid REFERENCES users (id) ON DELETE SET NULL,
  -- Told to the seller; optional
  reason text,
  PRIMARY KEY (event_id, user_id)
);
CREATE INDEX event_exclusions_user ON event_exclusions (user_id);

-- An announced item the seller did not hand in on time, turned down by the team: neither
-- listed nor sold, and it cannot be announced for the bazaar again.
ALTER TYPE event_product_status ADD VALUE 'rejected';
ALTER TABLE event_products
  ADD COLUMN rejected_at timestamptz,
  ADD COLUMN rejected_by uuid REFERENCES users (id) ON DELETE SET NULL;
