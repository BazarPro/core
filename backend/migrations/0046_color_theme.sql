-- The colour scheme of the installation, chosen by an admin; NULL is the default (blue)
ALTER TABLE site_settings ADD COLUMN color_theme text
  CHECK (color_theme IN ('blue', 'petrol', 'green', 'violet', 'orange', 'red'));
