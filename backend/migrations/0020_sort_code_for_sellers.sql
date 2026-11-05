-- Sorting codes are for sellers. A buyer without items must not use up one of the codes
-- that need no extra letter, so a code is given with the first item or bazaar. Codes are
-- never given out again, not even after an account is deleted: printed labels may still
-- carry them.
ALTER TABLE users ALTER COLUMN sort_code DROP IDENTITY;
ALTER TABLE users ALTER COLUMN sort_code DROP NOT NULL;
UPDATE users SET sort_code = NULL;

CREATE SEQUENCE users_sort_code_seq OWNED BY users.sort_code;

WITH sellers AS (
  SELECT id FROM users u
  WHERE EXISTS (SELECT 1 FROM products p WHERE p.vendor_id = u.id)
     OR EXISTS (SELECT 1 FROM event_sellers s WHERE s.user_id = u.id)
  ORDER BY created_at, id
), numbered AS (
  SELECT id, nextval('users_sort_code_seq')::integer AS code FROM sellers
)
UPDATE users u SET sort_code = n.code FROM numbered n WHERE n.id = u.id;

CREATE FUNCTION give_sort_code() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE users SET sort_code = nextval('users_sort_code_seq')
  WHERE id = (to_jsonb(NEW) ->> TG_ARGV[0])::uuid AND sort_code IS NULL;
  RETURN NULL;
END;
$$;

CREATE TRIGGER products_give_sort_code AFTER INSERT OR UPDATE OF vendor_id ON products
  FOR EACH ROW EXECUTE FUNCTION give_sort_code('vendor_id');
CREATE TRIGGER event_sellers_give_sort_code AFTER INSERT ON event_sellers
  FOR EACH ROW EXECUTE FUNCTION give_sort_code('user_id');
