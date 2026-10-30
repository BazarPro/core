-- Version of the keys of an event's ID codes (offline::event_key). Raised when someone
-- leaves the team of the event, or by its organizer: the keys a former helper's device
-- kept then make no valid codes any more.
ALTER TABLE events ADD COLUMN check_in_key_version integer NOT NULL DEFAULT 0;
