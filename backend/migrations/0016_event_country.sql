-- Country of the venue's address (ISO 3166-1 alpha-2, e.g. DE, AT, CH); empty is Germany.
ALTER TABLE events ADD COLUMN country text;
