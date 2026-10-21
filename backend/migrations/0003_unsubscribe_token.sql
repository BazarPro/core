-- Every user gets the token for unsubscribe links on creation. It used to be created with
-- the first notification mail, often during a sale: the column is UNIQUE, so the update
-- locked the seller's row against the foreign keys of a parallel sale (deadlock).

UPDATE users SET unsubscribe_token = replace(gen_random_uuid()::text, '-', '')
WHERE unsubscribe_token IS NULL;

ALTER TABLE users
  ALTER COLUMN unsubscribe_token SET DEFAULT replace(gen_random_uuid()::text, '-', ''),
  ALTER COLUMN unsubscribe_token SET NOT NULL;
