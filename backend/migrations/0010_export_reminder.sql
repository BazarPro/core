-- Organizers are reminded to export the settlement before the settlement period and before
-- the public archive end (#173); this is the deadline the reminder was sent for.

ALTER TABLE events ADD COLUMN export_reminder_sent_for timestamptz;
