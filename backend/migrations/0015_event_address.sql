-- Address of the venue next to the free-text location (its name, e.g. "Turnhalle Nord"):
-- search engines show an event in their event results only with a postal address.
ALTER TABLE events ADD COLUMN street text, ADD COLUMN postal_code text, ADD COLUMN city text;
