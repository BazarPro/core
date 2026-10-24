-- OAuth sign-in of the mobile app: the browser hands a one-time code to the app via deep
-- link, the app exchanges it for a session token with its PKCE verifier.

CREATE TABLE app_sign_in_codes (
    code_hash bytea PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    challenge text NOT NULL,
    expires_at timestamptz NOT NULL
);
