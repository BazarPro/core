-- The organizer invites someone by mail to a bazaar, as seller or helper. One row per mail
-- sent, which also counts them for the daily limit. Rows hold an address of someone who may
-- never answer, so they go soon after the bazaar (retention.rs).
CREATE TABLE event_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  event_id uuid NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  email text NOT NULL,
  helper boolean NOT NULL,
  invited_by uuid REFERENCES users (id) ON DELETE SET NULL,
  token_hash bytea NOT NULL UNIQUE,
  -- Used, taken back, or replaced by a newer invitation to the same address
  closed_at timestamptz
);
CREATE INDEX event_invitations_event ON event_invitations (event_id, created_at);
