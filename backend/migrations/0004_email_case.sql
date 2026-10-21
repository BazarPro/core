-- Email addresses are compared without case (#139). New ones are stored in lower case;
-- imported ones keep how they were typed, so the lookups use lower() and these indexes.

DROP INDEX users_email_idx;
CREATE INDEX users_email_idx ON users (lower(email));
CREATE INDEX auth_accounts_lower_account_idx ON auth_accounts (provider, lower(provider_account_id));
