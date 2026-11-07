-- An organizer may prepare a bazaar over several sessions before the event has all
-- required fields. Keeping the incomplete form separate avoids weakening the
-- constraints of published events.
CREATE TABLE event_drafts (
  organizer_id uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  updated_at timestamptz NOT NULL DEFAULT now(),
  draft jsonb NOT NULL
);
