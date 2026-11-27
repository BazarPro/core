-- When the item's label was last printed: until then "label missing" for the seller.
ALTER TABLE products ADD COLUMN label_printed_at timestamptz;

-- What is printed on the label changed: the label at the item is out of date
CREATE FUNCTION reset_label_printed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.title IS DISTINCT FROM OLD.title
     OR NEW.price IS DISTINCT FROM OLD.price
     OR NEW.attributes IS DISTINCT FROM OLD.attributes THEN
    NEW.label_printed_at := NULL;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER products_reset_label_printed
  BEFORE UPDATE OF title, price, attributes ON products
  FOR EACH ROW EXECUTE FUNCTION reset_label_printed();

-- Items from before: nobody knows, and "missing" on all of them would alarm for nothing
UPDATE products SET label_printed_at = updated_at;
