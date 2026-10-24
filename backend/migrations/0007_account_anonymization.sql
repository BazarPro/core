-- Deleting an account removes the personal data (#168). The users row stays as an empty
-- placeholder, so purchases, events, roles and the moderation log keep their references.

ALTER TABLE users
  -- The user asked to delete the account; it is anonymized after the grace period
  ADD COLUMN deletion_requested_at timestamptz,
  -- Personal data and sign-ins are gone; only the ID is left
  ADD COLUMN anonymized_at timestamptz;
CREATE INDEX users_deletion_due_idx ON users (deletion_requested_at)
  WHERE deletion_requested_at IS NOT NULL AND anonymized_at IS NULL;

-- Accounts deleted before only had their status set: their grace period starts now
UPDATE users SET deletion_requested_at = now()
WHERE status = 'deleted' AND managed_by_event_id IS NULL;

/** Banned users who were anonymized: the address may not sign up again until expires_at. */
CREATE TABLE banned_identities (
  -- HMAC-SHA256 of the address in lower case, see auth::banned_identities
  email_hmac bytea PRIMARY KEY,
  banned_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

/** Keys the instance creates itself when the environment sets none. */
CREATE TABLE instance_secrets (
  name text PRIMARY KEY,
  value bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
