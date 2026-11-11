-- Wrong guesses at a code count on the code itself: after a few it is no longer accepted,
-- however many clients guess (see auth::password_flows::claim_code)
ALTER TABLE verification_codes ADD COLUMN failed_attempts integer NOT NULL DEFAULT 0;

-- The quota of uploads sums the files of one user (storage::upload)
CREATE INDEX files_uploaded_by_idx ON files (uploaded_by);
