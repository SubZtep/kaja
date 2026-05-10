CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE proname = 'uuidv7'
      AND pronargs = 0
      AND pg_function_is_visible(oid)
  ) THEN
    CREATE FUNCTION uuidv7()
    RETURNS uuid
    LANGUAGE plpgsql
    VOLATILE
    AS $fn$
    DECLARE
      ts bytea;
      rnd bytea;
    BEGIN
      ts := substring(
        int8send(floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint)
        FROM 3
      );

      rnd := gen_random_bytes(10);

      -- UUIDv7 version bits
      rnd := set_byte(rnd, 0, (get_byte(rnd, 0) & 15) | 112);

      -- UUID variant bits
      rnd := set_byte(rnd, 2, (get_byte(rnd, 2) & 63) | 128);

      RETURN encode(ts || rnd, 'hex')::uuid;
    END;
    $fn$;
  END IF;
END
$$;
