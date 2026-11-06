-- The mark on universal labels is now a digit with a sort letter, a pair of letters and a
-- number (src/shared/sortCode.ts): 9,956,000 codes without an extra letter instead of
-- 100,000. Labels printed with the old mark of shapes do not look like the new one anyway,
-- so every seller draws a new code from the larger range. Labels printed before have to be
-- printed again.
--
-- The number of codes per letter is a function of its own so that tests can make it small.
CREATE FUNCTION sort_code_patterns() RETURNS integer LANGUAGE sql STABLE AS $$
  SELECT 9956000
$$;

CREATE OR REPLACE FUNCTION assign_sort_code(seller uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  patterns CONSTANT integer := sort_code_patterns();
  tries_per_letter CONSTANT integer := 20;
  letter integer := 0;
  candidate integer;
BEGIN
  LOOP
    FOR try IN 1..tries_per_letter LOOP
      candidate := letter * patterns + floor(random() * patterns)::integer;
      BEGIN
        UPDATE users SET sort_code = candidate WHERE id = seller AND sort_code IS NULL;
        RETURN;
      EXCEPTION WHEN unique_violation THEN
        NULL; -- Taken: draw again
      END;
    END LOOP;
    letter := letter + 1;
  END LOOP;
END;
$$;

DO $$
DECLARE
  seller uuid;
BEGIN
  CREATE TEMP TABLE sellers ON COMMIT DROP AS SELECT id FROM users WHERE sort_code IS NOT NULL;
  UPDATE users SET sort_code = NULL;
  FOR seller IN SELECT id FROM sellers LOOP
    PERFORM assign_sort_code(seller);
  END LOOP;
END;
$$;
