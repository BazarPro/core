-- Names of a category in other languages. `label` stays the name that counts: it decides
-- the extra fields of its items and is shown wherever a language has no translation.
ALTER TABLE categories ADD COLUMN translations jsonb NOT NULL DEFAULT '{}';

UPDATE categories c
SET translations = jsonb_build_object('en', d.en)
FROM (VALUES
  ('Kleidung', 'Clothing'),
  ('Schuhe', 'Shoes'),
  ('Sport', 'Sports'),
  ('Fahrräder', 'Bikes'),
  ('Elektronik', 'Electronics'),
  ('Bücher', 'Books'),
  ('Spielzeug', 'Toys'),
  ('Möbel', 'Furniture'),
  ('Haushalt', 'Household'),
  ('Accessoires', 'Accessories'),
  ('Sonstiges', 'Other')
) AS d (de, en)
WHERE c.label = d.de;
