-- Items left over at the end of a bazaar go back to their sellers (#305): by the team at
-- once or by the nightly cron after the bazaar (feature autoReturn, on by default).

-- Returned by the cron, not by a person: the team clears up with whom they really are
ALTER TABLE event_products ADD COLUMN auto_returned_at timestamptz;

-- The cron returned what was left of this bazaar; it does so once
ALTER TABLE events ADD COLUMN leftovers_returned_at timestamptz;

-- Bazaars over before this change stay as their teams left them
UPDATE events SET leftovers_returned_at = now() WHERE end_date < now();
