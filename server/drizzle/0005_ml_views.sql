-- Read-only views for the ML service (docs/ML_PLAN.md). The ML service reads these views, never the
-- operational tables, and writes only model_versions, model_training_records and predictions
-- (server/sql/ml_service_role.sql). A new modelling task gets its own view here, reviewed like any
-- other schema change.

-- One row per restoration attempt.
--   Feature columns hold only what was recorded before the attempt started (features_as_of): the
--   battery family, the battery's age, the lot references entered when the attempt was opened, and
--   the before-test, which must have been approved by then. Nothing from the after-test or the
--   decision is a feature.
--   label_* columns hold the outcome: the engineering decision, its reason code, and the approved
--   after-test as a percentage of rated capacity. Undecided attempts have empty labels, so the same
--   view serves training (decided rows) and scoring (open rows).
-- Corrected battery fields (e.g. manufacture date) show their current value. Models trained before
-- such a correction are listed in ml_model_review_flags.
CREATE VIEW "ml_restoration_attempt_features" AS
SELECT
  a."id" AS "attempt_id",
  a."battery_id",
  a."batch_id",
  a."attempt_no",
  a."attempt_no" - 1 AS "prior_attempts",
  a."started_at" AS "features_as_of",
  f."id" AS "family_id",
  f."chemistry",
  f."unit_type",
  f."rated_capacity_ah",
  CASE WHEN b."manufactured_on" IS NULL THEN NULL
    ELSE (a."started_at" AT TIME ZONE 'UTC')::date - b."manufactured_on" END AS "age_days",
  a."lot_refs" AS "process_lot_refs",
  bt."id" AS "before_test_id",
  bt."kind" AS "before_test_kind",
  bt."protocol_id" AS "before_protocol_id",
  bt."instrument" AS "before_instrument",
  bt."started_at" AS "before_tested_at",
  (bt."result"->>'openCircuitVoltageV')::double precision AS "before_ocv_v",
  (bt."result"->>'internalResistanceMOhm')::double precision AS "before_internal_resistance_mohm",
  (bt."result"->>'temperatureC')::double precision AS "before_temperature_c",
  (bt."result"->>'capacityAh')::double precision AS "before_capacity_ah",
  round((100 * (bt."result"->>'capacityAh')::double precision / f."rated_capacity_ah")::numeric, 1) AS "before_capacity_pct_of_rated",
  CASE WHEN a."status" IN ('approved', 'rejected', 'rework') THEN a."status" END AS "label_outcome",
  a."decision_reason_code" AS "label_reason_code",
  a."decided_at" AS "label_decided_at",
  aft."id" AS "label_after_test_id",
  round((100 * (aft."result"->>'capacityAh')::double precision / f."rated_capacity_ah")::numeric, 1) AS "label_after_capacity_pct_of_rated"
FROM "restoration_attempts" a
JOIN "batteries" b ON b."id" = a."battery_id"
JOIN "battery_families" f ON f."id" = b."family_id"
LEFT JOIN "tests" bt ON bt."id" = a."before_test_id"
  AND bt."status" = 'approved' AND bt."reviewed_at" <= a."started_at"
LEFT JOIN "tests" aft ON aft."id" = a."after_test_id"
  AND aft."status" = 'approved' AND a."status" IN ('approved', 'rejected', 'rework');
--> statement-breakpoint

-- Model versions that a person should look at because of something that happened after they were
-- registered. Retired versions and versions without recorded training records are not listed.
--   training_record_corrected: a battery whose records trained the model has had its serial or
--   manufacture date corrected. Location corrections are not flagged: they say where a battery is,
--   not what it is.
--   family_not_in_training, protocol_not_in_training, instrument_not_in_training: a restoration
--   attempt opened after registration has a family, before-test protocol revision or instrument that
--   none of the model's training attempts had. Its outputs for that attempt are outside what it learned.
-- A flag is a prompt for review, not an automatic retrain or retirement.
CREATE VIEW "ml_model_review_flags" AS
WITH "live" AS (
  SELECT mv."id", mv."registered_at" FROM "model_versions" mv
  WHERE mv."status" <> 'retired'
    AND EXISTS (SELECT 1 FROM "model_training_records" r WHERE r."model_version_id" = mv."id")
),
"trained" AS (
  SELECT r."model_version_id", x."family_id", x."before_protocol_id", x."before_instrument"
  FROM "model_training_records" r
  JOIN "ml_restoration_attempt_features" x ON r."record_kind" = 'restoration_attempt' AND x."attempt_id" = r."record_id"
),
"recent" AS (
  SELECT l."id" AS "model_version_id", x.*
  FROM "live" l
  JOIN "ml_restoration_attempt_features" x ON x."features_as_of" > l."registered_at"
  WHERE EXISTS (SELECT 1 FROM "trained" t WHERE t."model_version_id" = l."id")
)
SELECT DISTINCT l."id" AS "model_version_id", 'training_record_corrected' AS "flag", e."battery_id",
  e."id" AS "source_record_id", e."correction"->>'field' AS "detail", e."recorded_at" AS "observed_at"
FROM "live" l
JOIN "model_training_records" r ON r."model_version_id" = l."id"
JOIN "battery_events" e ON e."battery_id" = r."battery_id" AND e."recorded_at" > l."registered_at"
  AND e."correction"->>'field' IS NOT NULL AND e."correction"->>'field' <> 'physicalLocation'
UNION ALL
SELECT n."model_version_id", 'family_not_in_training', n."battery_id", n."attempt_id", n."family_id", n."features_as_of"
FROM "recent" n
WHERE NOT EXISTS (SELECT 1 FROM "trained" t WHERE t."model_version_id" = n."model_version_id" AND t."family_id" = n."family_id")
UNION ALL
SELECT n."model_version_id", 'protocol_not_in_training', n."battery_id", n."attempt_id", n."before_protocol_id", n."features_as_of"
FROM "recent" n
WHERE n."before_protocol_id" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "trained" t WHERE t."model_version_id" = n."model_version_id" AND t."before_protocol_id" = n."before_protocol_id")
UNION ALL
SELECT n."model_version_id", 'instrument_not_in_training', n."battery_id", n."attempt_id", n."before_instrument", n."features_as_of"
FROM "recent" n
WHERE n."before_instrument" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "trained" t WHERE t."model_version_id" = n."model_version_id" AND t."before_instrument" = n."before_instrument");
