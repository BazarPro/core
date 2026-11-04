-- A code must not tell when an account was made, and a new bazaar must not start at 00 00:
-- codes are drawn at random. A code without a letter is drawn while one is easy to find,
-- then one with the next letter (see src/shared/sortCode.ts). Codes stay unique and are
-- never given out again. No labels were printed with the numbers before.
CREATE FUNCTION assign_sort_code(seller uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  patterns CONSTANT integer := 100000;
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

CREATE OR REPLACE FUNCTION give_sort_code() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM assign_sort_code((to_jsonb(NEW) ->> TG_ARGV[0])::uuid);
  RETURN NULL;
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

DROP SEQUENCE users_sort_code_seq;
