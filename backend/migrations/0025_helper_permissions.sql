-- What a helper (co-organizer) may do at the bazaar (#47). NULL: everything, as before, so
-- helpers of existing events keep their rights. Only set on co-organizer roles.
ALTER TABLE event_roles ADD COLUMN permissions text[];
