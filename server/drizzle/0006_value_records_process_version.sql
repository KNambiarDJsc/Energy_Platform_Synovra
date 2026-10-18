CREATE TABLE IF NOT EXISTS "value_records" (
	"id" text PRIMARY KEY NOT NULL,
	"battery_id" text NOT NULL,
	"kind" text NOT NULL,
	"amount_aed" numeric(14, 2),
	"recorded_on" date NOT NULL,
	"counterparty" text NOT NULL,
	"reference" text,
	"source" text NOT NULL,
	"note" text NOT NULL,
	"recorded_by_name" text NOT NULL,
	"seq" integer GENERATED ALWAYS AS IDENTITY (sequence name "value_records_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	CONSTRAINT "value_records_amount_ck" CHECK ("value_records"."amount_aed" IS NULL OR "value_records"."amount_aed" >= 0)
);
--> statement-breakpoint
ALTER TABLE "restoration_batches" ADD COLUMN "process_version" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "value_records" ADD CONSTRAINT "value_records_battery_id_batteries_id_fk" FOREIGN KEY ("battery_id") REFERENCES "public"."batteries"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "value_records_battery_idx" ON "value_records" USING btree ("battery_id");

--> statement-breakpoint
-- Money in is history too: a value record is never edited or deleted. A correction is a new record.
CREATE TRIGGER value_records_append_only
  BEFORE UPDATE OR DELETE ON value_records
  FOR EACH ROW EXECUTE FUNCTION synovra_append_only();
--> statement-breakpoint
-- Two more columns at the end of the training view: the batch's process version (a feature), and value
-- recorded for the battery after the attempt started (a label, never a feature).
CREATE OR REPLACE VIEW "ml_restoration_attempt_features" AS
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
  round((100 * (aft."result"->>'capacityAh')::double precision / f."rated_capacity_ah")::numeric, 1) AS "label_after_capacity_pct_of_rated",
  rb."process_version",
  (SELECT sum(v."amount_aed") FROM "value_records" v
    WHERE v."battery_id" = a."battery_id" AND v."amount_aed" IS NOT NULL AND v."recorded_on" >= (a."started_at" AT TIME ZONE 'UTC')::date) AS "label_value_aed"
FROM "restoration_attempts" a
JOIN "restoration_batches" rb ON rb."id" = a."batch_id"
JOIN "batteries" b ON b."id" = a."battery_id"
JOIN "battery_families" f ON f."id" = b."family_id"
LEFT JOIN "tests" bt ON bt."id" = a."before_test_id"
  AND bt."status" = 'approved' AND bt."reviewed_at" <= a."started_at"
LEFT JOIN "tests" aft ON aft."id" = a."after_test_id"
  AND aft."status" = 'approved' AND a."status" IN ('approved', 'rejected', 'rework');
