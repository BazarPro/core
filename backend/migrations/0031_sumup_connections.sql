-- SumUp connected with OAuth (#155): the organizer authorizes BazarPro once, and every
-- cash desk of their team logs the SumUp SDK in with a short-lived access token from the
-- backend. The team needs no SumUp login of its own. The tokens are encrypted with a key
-- derived from SUMUP_CLIENT_SECRET (modules::sumup), so a database dump alone is no use.

CREATE TABLE sumup_connections (
  user_id uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  -- From SumUp's /me; shown to the team so they know which account takes the money
  merchant_code text,
  refresh_token bytea NOT NULL,
  -- The last access token, handed to every desk until it is about to expire
  access_token bytea,
  access_expires_at timestamptz,
  connected_at timestamptz NOT NULL DEFAULT now()
);

-- The connect flow from its start to SumUp's callback; one use, ten minutes
CREATE TABLE sumup_oauth_states (
  state_hash bytea PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- 'app' for the mobile app (deep link back), else a path of the web app
  target text NOT NULL,
  expires_at timestamptz NOT NULL
);
