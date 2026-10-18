CREATE TABLE IF NOT EXISTS "model_training_records" (
	"model_version_id" text NOT NULL,
	"record_kind" text NOT NULL,
	"record_id" text NOT NULL,
	"battery_id" text NOT NULL,
	"seq" integer GENERATED ALWAYS AS IDENTITY (sequence name "model_training_records_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	CONSTRAINT "model_training_records_model_version_id_record_kind_record_id_pk" PRIMARY KEY("model_version_id","record_kind","record_id")
);
--> statement-breakpoint
ALTER TABLE "restoration_attempts" ADD COLUMN "decision_reason_code" text;--> statement-breakpoint
ALTER TABLE "tests" ADD COLUMN "review_reason_code" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "model_training_records" ADD CONSTRAINT "model_training_records_model_version_id_model_versions_id_fk" FOREIGN KEY ("model_version_id") REFERENCES "public"."model_versions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "model_training_records" ADD CONSTRAINT "model_training_records_battery_id_batteries_id_fk" FOREIGN KEY ("battery_id") REFERENCES "public"."batteries"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "model_training_records_battery_idx" ON "model_training_records" USING btree ("battery_id");--> statement-breakpoint
-- NOT VALID: rows decided before reason codes existed keep their free-text reason and no code.
-- Every new or changed row is checked.
ALTER TABLE "restoration_attempts" ADD CONSTRAINT "attempts_reason_code_ck" CHECK ("restoration_attempts"."status" NOT IN ('rejected', 'rework') OR "restoration_attempts"."decision_reason_code" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "tests" ADD CONSTRAINT "tests_reason_code_ck" CHECK ("tests"."status" NOT IN ('rejected', 'requires_rework') OR "tests"."review_reason_code" IS NOT NULL) NOT VALID;