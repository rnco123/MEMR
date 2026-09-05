-- ---------------------------------------------------------------------------
-- Backfill: convert legacy boolean consent_ack values to ISO timestamps.
--
-- The patient signing flow historically wrote {"telemedicine": true, ...}
-- into encounters.consent_ack, but the documented contract (see the column
-- comment from migration 033) is key -> ISO timestamp of acknowledgment.
-- The booleans broke the rooming PATCH validation and were invisible to
-- isImmigrationEncounter(), which requires a non-empty string.
--
-- The booking app now writes timestamps, and the rooming route normalizes on
-- write, so this is a one-time cleanup of rows created before those fixes:
--   * true  -> the packet's signed_at, falling back to the encounter's
--              created_at/updated_at rendered as an ISO-8601 UTC string
--   * false -> key removed (absent = not acknowledged)
--   * strings pass through untouched
-- ---------------------------------------------------------------------------

UPDATE public.encounters
SET consent_ack = COALESCE(
  (
    SELECT jsonb_object_agg(
      e.key,
      CASE
        WHEN jsonb_typeof(e.value) = 'boolean' THEN to_jsonb(
          COALESCE(
            encounters.consent_ack ->> 'signed_at',
            to_char(
              COALESCE(encounters.created_at, encounters.updated_at, now()) AT TIME ZONE 'UTC',
              'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
            )
          )
        )
        ELSE e.value
      END
    )
    FROM jsonb_each(encounters.consent_ack) AS e(key, value)
    WHERE NOT (jsonb_typeof(e.value) = 'boolean' AND e.value = 'false'::jsonb)
  ),
  '{}'::jsonb
)
WHERE jsonb_typeof(consent_ack) = 'object'
  AND EXISTS (
    SELECT 1
    FROM jsonb_each(consent_ack) AS c(key, value)
    WHERE jsonb_typeof(c.value) = 'boolean'
  );
