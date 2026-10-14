CREATE TABLE IF NOT EXISTS "assignments" (
	"id" text PRIMARY KEY NOT NULL,
	"battery_id" text NOT NULL,
	"slot_id" text NOT NULL,
	"start_at" timestamp (3) with time zone NOT NULL,
	"end_at" timestamp (3) with time zone,
	"reason" text NOT NULL,
	"actor_id" text NOT NULL,
	"seq" integer GENERATED ALWAYS AS IDENTITY (sequence name "assignments_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	CONSTRAINT "assignments_period_ck" CHECK ("assignments"."end_at" IS NULL OR "assignments"."end_at" >= "assignments"."start_at")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"at" timestamp (3) with time zone NOT NULL,
	"actor_id" text NOT NULL,
	"actor_name" text NOT NULL,
	"role" text NOT NULL,
	"action" text NOT NULL,
	"entity_kind" text NOT NULL,
	"entity_id" text NOT NULL,
	"summary" text NOT NULL,
	"outcome" text NOT NULL,
	"seq" integer GENERATED ALWAYS AS IDENTITY (sequence name "audit_events_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "banks" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"name" text NOT NULL,
	"seq" integer GENERATED ALWAYS AS IDENTITY (sequence name "banks_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "batteries" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"label" text NOT NULL,
	"public_ref" text NOT NULL,
	"manufacturer_serial" text,
	"family_id" text NOT NULL,
	"manufactured_on" date,
	"lifecycle_state" text NOT NULL,
	"site_id" text,
	"current_assignment_id" text,
	"physical_location" text NOT NULL,
	"restoration_batch_id" text,
	"replaces_battery_id" text,
	"created_at" timestamp (3) with time zone NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL,
	"source_system" text NOT NULL,
	"internal_notes" text DEFAULT '' NOT NULL,
	"seq" integer GENERATED ALWAYS AS IDENTITY (sequence name "batteries_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "battery_aliases" (
	"id" text PRIMARY KEY NOT NULL,
	"battery_id" text NOT NULL,
	"kind" text NOT NULL,
	"value" text NOT NULL,
	"source" text NOT NULL,
	"seq" integer GENERATED ALWAYS AS IDENTITY (sequence name "battery_aliases_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "battery_events" (
	"id" text PRIMARY KEY NOT NULL,
	"battery_id" text NOT NULL,
	"type" text NOT NULL,
	"occurred_at" timestamp (3) with time zone NOT NULL,
	"date_certainty" text NOT NULL,
	"recorded_at" timestamp (3) with time zone NOT NULL,
	"actor_id" text NOT NULL,
	"actor_name" text NOT NULL,
	"title" text NOT NULL,
	"reason" text NOT NULL,
	"evidence_ids" jsonb NOT NULL,
	"approval_state" text NOT NULL,
	"correction" jsonb,
	"source_system" text NOT NULL,
	"previous_state" text,
	"new_state" text,
	"ref" jsonb,
	"seq" integer GENERATED ALWAYS AS IDENTITY (sequence name "battery_events_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "battery_families" (
	"id" text PRIMARY KEY NOT NULL,
	"manufacturer" text NOT NULL,
	"model" text NOT NULL,
	"chemistry" text NOT NULL,
	"unit_type" text NOT NULL,
	"rated_voltage_v" double precision NOT NULL,
	"rated_capacity_ah" double precision NOT NULL,
	"rating_conditions" text NOT NULL,
	"rate_hours" double precision NOT NULL,
	"rated_temp_c" double precision NOT NULL,
	"end_voltage_per_unit_v" double precision NOT NULL,
	"seq" integer GENERATED ALWAYS AS IDENTITY (sequence name "battery_families_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	CONSTRAINT "families_rating_ck" CHECK ("battery_families"."rated_capacity_ah" > 0 AND "battery_families"."rated_voltage_v" > 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cost_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"battery_id" text,
	"batch_id" text,
	"kind" text NOT NULL,
	"amount_aed" numeric(14, 2),
	"allocation" text NOT NULL,
	"recorded_on" date NOT NULL,
	"note" text NOT NULL,
	"source" text NOT NULL,
	"allocation_basis" text,
	"seq" integer GENERATED ALWAYS AS IDENTITY (sequence name "cost_entries_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	CONSTRAINT "costs_scope_ck" CHECK ("cost_entries"."battery_id" IS NOT NULL OR "cost_entries"."batch_id" IS NOT NULL),
	CONSTRAINT "costs_amount_ck" CHECK ("cost_entries"."amount_aed" IS NULL OR "cost_entries"."amount_aed" >= 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "evidence_files" (
	"id" text PRIMARY KEY NOT NULL,
	"battery_id" text,
	"kind" text NOT NULL,
	"file_name" text NOT NULL,
	"size_kb" integer NOT NULL,
	"uploaded_at" timestamp (3) with time zone NOT NULL,
	"uploaded_by_name" text NOT NULL,
	"checksum" text NOT NULL,
	"classification" text NOT NULL,
	"storage_key" text,
	"seq" integer GENERATED ALWAYS AS IDENTITY (sequence name "evidence_files_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "import_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"file_name" text NOT NULL,
	"file_hash" text NOT NULL,
	"template_id" text NOT NULL,
	"mapping_version" text NOT NULL,
	"actor_name" text NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	"committed_at" timestamp (3) with time zone,
	"status" text NOT NULL,
	"prior_commit_at" text,
	"rows" jsonb NOT NULL,
	"counts" jsonb NOT NULL,
	"seq" integer GENERATED ALWAYS AS IDENTITY (sequence name "import_jobs_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "import_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"version" text NOT NULL,
	"description" text NOT NULL,
	"columns" jsonb NOT NULL,
	"seq" integer GENERATED ALWAYS AS IDENTITY (sequence name "import_templates_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "model_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"version" text NOT NULL,
	"status" text NOT NULL,
	"baseline" text NOT NULL,
	"training_cohort" text NOT NULL,
	"evaluation_report_ref" text,
	"registered_at" timestamp (3) with time zone NOT NULL,
	"seq" integer GENERATED ALWAYS AS IDENTITY (sequence name "model_versions_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	CONSTRAINT "model_versions_validated_needs_evidence_ck" CHECK ("model_versions"."status" <> 'validated' OR "model_versions"."evaluation_report_ref" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notification_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"channel" text NOT NULL,
	"enabled" boolean NOT NULL,
	"seq" integer GENERATED ALWAYS AS IDENTITY (sequence name "notification_settings_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "predictions" (
	"id" text PRIMARY KEY NOT NULL,
	"model_version_id" text NOT NULL,
	"kind" text NOT NULL,
	"battery_id" text,
	"site_id" text,
	"input_at" timestamp (3) with time zone NOT NULL,
	"predicted_at" timestamp (3) with time zone NOT NULL,
	"output" jsonb NOT NULL,
	"uncertainty" text NOT NULL,
	"applicability" jsonb NOT NULL,
	"source_record_ids" jsonb NOT NULL,
	"factors" jsonb NOT NULL,
	"inputs_used" text NOT NULL,
	"review_state" text DEFAULT 'unreviewed' NOT NULL,
	"reviewed_by_name" text,
	"seq" integer GENERATED ALWAYS AS IDENTITY (sequence name "predictions_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	CONSTRAINT "predictions_input_before_prediction_ck" CHECK ("predictions"."input_at" <= "predictions"."predicted_at")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "recycling_records" (
	"id" text PRIMARY KEY NOT NULL,
	"battery_id" text NOT NULL,
	"state" text NOT NULL,
	"recycler_name" text NOT NULL,
	"consignment_ref" text,
	"mass_kg" double precision,
	"consigned_on" date,
	"certificate_state" text NOT NULL,
	"certificate_ref" text,
	"seq" integer GENERATED ALWAYS AS IDENTITY (sequence name "recycling_records_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reports" (
	"id" text PRIMARY KEY NOT NULL,
	"template_id" text NOT NULL,
	"title" text NOT NULL,
	"scope" text NOT NULL,
	"period_from" date NOT NULL,
	"period_to" date NOT NULL,
	"generated_at" timestamp (3) with time zone NOT NULL,
	"generated_by_name" text NOT NULL,
	"audience" text NOT NULL,
	"approval_state" text NOT NULL,
	"approved_by_name" text,
	"source_watermark" text NOT NULL,
	"evidence_refs" jsonb NOT NULL,
	"sections" jsonb NOT NULL,
	"seq" integer GENERATED ALWAYS AS IDENTITY (sequence name "reports_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	CONSTRAINT "reports_period_ck" CHECK ("reports"."period_to" >= "reports"."period_from")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "restoration_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"batch_id" text NOT NULL,
	"battery_id" text NOT NULL,
	"attempt_no" integer NOT NULL,
	"status" text NOT NULL,
	"before_test_id" text,
	"after_test_id" text,
	"notes" jsonb NOT NULL,
	"lot_refs" jsonb NOT NULL,
	"evidence_ids" jsonb NOT NULL,
	"started_at" timestamp (3) with time zone NOT NULL,
	"submitted_at" timestamp (3) with time zone,
	"decided_at" timestamp (3) with time zone,
	"decider_name" text,
	"decision_reason" text,
	"seq" integer GENERATED ALWAYS AS IDENTITY (sequence name "restoration_attempts_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "restoration_batches" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"family_id" text NOT NULL,
	"opened_on" date NOT NULL,
	"status" text NOT NULL,
	"planned_count" integer NOT NULL,
	"seq" integer GENERATED ALWAYS AS IDENTITY (sequence name "restoration_batches_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sites" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"name" text NOT NULL,
	"city" text NOT NULL,
	"kind" text NOT NULL,
	"seq" integer GENERATED ALWAYS AS IDENTITY (sequence name "sites_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "slots" (
	"id" text PRIMARY KEY NOT NULL,
	"string_id" text NOT NULL,
	"bank_id" text NOT NULL,
	"site_id" text NOT NULL,
	"position" integer NOT NULL,
	"seq" integer GENERATED ALWAYS AS IDENTITY (sequence name "slots_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "strings" (
	"id" text PRIMARY KEY NOT NULL,
	"bank_id" text NOT NULL,
	"site_id" text NOT NULL,
	"name" text NOT NULL,
	"family_id" text NOT NULL,
	"nominal_voltage_v" double precision NOT NULL,
	"seq" integer GENERATED ALWAYS AS IDENTITY (sequence name "strings_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenants" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"seq" integer GENERATED ALWAYS AS IDENTITY (sequence name "tenants_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "test_protocols" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"revision" text NOT NULL,
	"status" text NOT NULL,
	"summary" text NOT NULL,
	"seq" integer GENERATED ALWAYS AS IDENTITY (sequence name "test_protocols_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tests" (
	"id" text PRIMARY KEY NOT NULL,
	"battery_id" text,
	"string_id" text,
	"level" text NOT NULL,
	"kind" text NOT NULL,
	"protocol_id" text NOT NULL,
	"status" text NOT NULL,
	"operator_id" text NOT NULL,
	"operator_name" text NOT NULL,
	"witness_name" text,
	"instrument" text NOT NULL,
	"calibration_ref" text NOT NULL,
	"conditions" jsonb NOT NULL,
	"result" jsonb NOT NULL,
	"evidence_ids" jsonb NOT NULL,
	"attempt_id" text,
	"started_at" timestamp (3) with time zone NOT NULL,
	"submitted_at" timestamp (3) with time zone,
	"submitted_by_id" text,
	"reviewed_at" timestamp (3) with time zone,
	"reviewer_id" text,
	"reviewer_name" text,
	"review_reason" text,
	"seq" integer GENERATED ALWAYS AS IDENTITY (sequence name "tests_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	CONSTRAINT "tests_level_target_ck" CHECK (("tests"."level" = 'battery' AND "tests"."battery_id" IS NOT NULL AND "tests"."string_id" IS NULL)
    OR ("tests"."level" = 'string' AND "tests"."string_id" IS NOT NULL AND "tests"."battery_id" IS NULL)),
	CONSTRAINT "tests_separation_of_duties_ck" CHECK ("tests"."status" <> 'approved'
    OR ("tests"."reviewer_id" IS NOT NULL AND "tests"."reviewer_id" <> "tests"."operator_id" AND "tests"."reviewer_id" IS DISTINCT FROM "tests"."submitted_by_id"))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"name" text NOT NULL,
	"title" text NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"site_scope" jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"external_subject" text,
	"seq" integer GENERATED ALWAYS AS IDENTITY (sequence name "users_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "warranties" (
	"id" text PRIMARY KEY NOT NULL,
	"battery_id" text NOT NULL,
	"terms_ref" text,
	"starts_on" date,
	"ends_on" date,
	"state" text NOT NULL,
	"claims" jsonb NOT NULL,
	"seq" integer GENERATED ALWAYS AS IDENTITY (sequence name "warranties_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1)
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assignments" ADD CONSTRAINT "assignments_battery_id_batteries_id_fk" FOREIGN KEY ("battery_id") REFERENCES "public"."batteries"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assignments" ADD CONSTRAINT "assignments_slot_id_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."slots"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "banks" ADD CONSTRAINT "banks_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "batteries" ADD CONSTRAINT "batteries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "batteries" ADD CONSTRAINT "batteries_family_id_battery_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."battery_families"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "batteries" ADD CONSTRAINT "batteries_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "batteries" ADD CONSTRAINT "batteries_restoration_batch_id_restoration_batches_id_fk" FOREIGN KEY ("restoration_batch_id") REFERENCES "public"."restoration_batches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "battery_aliases" ADD CONSTRAINT "battery_aliases_battery_id_batteries_id_fk" FOREIGN KEY ("battery_id") REFERENCES "public"."batteries"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "battery_events" ADD CONSTRAINT "battery_events_battery_id_batteries_id_fk" FOREIGN KEY ("battery_id") REFERENCES "public"."batteries"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cost_entries" ADD CONSTRAINT "cost_entries_battery_id_batteries_id_fk" FOREIGN KEY ("battery_id") REFERENCES "public"."batteries"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cost_entries" ADD CONSTRAINT "cost_entries_batch_id_restoration_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."restoration_batches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "evidence_files" ADD CONSTRAINT "evidence_files_battery_id_batteries_id_fk" FOREIGN KEY ("battery_id") REFERENCES "public"."batteries"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_template_id_import_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."import_templates"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "predictions" ADD CONSTRAINT "predictions_model_version_id_model_versions_id_fk" FOREIGN KEY ("model_version_id") REFERENCES "public"."model_versions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "predictions" ADD CONSTRAINT "predictions_battery_id_batteries_id_fk" FOREIGN KEY ("battery_id") REFERENCES "public"."batteries"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "predictions" ADD CONSTRAINT "predictions_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recycling_records" ADD CONSTRAINT "recycling_records_battery_id_batteries_id_fk" FOREIGN KEY ("battery_id") REFERENCES "public"."batteries"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "restoration_attempts" ADD CONSTRAINT "restoration_attempts_batch_id_restoration_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."restoration_batches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "restoration_attempts" ADD CONSTRAINT "restoration_attempts_battery_id_batteries_id_fk" FOREIGN KEY ("battery_id") REFERENCES "public"."batteries"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "restoration_attempts" ADD CONSTRAINT "restoration_attempts_before_test_id_tests_id_fk" FOREIGN KEY ("before_test_id") REFERENCES "public"."tests"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "restoration_attempts" ADD CONSTRAINT "restoration_attempts_after_test_id_tests_id_fk" FOREIGN KEY ("after_test_id") REFERENCES "public"."tests"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "restoration_batches" ADD CONSTRAINT "restoration_batches_family_id_battery_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."battery_families"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sites" ADD CONSTRAINT "sites_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "slots" ADD CONSTRAINT "slots_string_id_strings_id_fk" FOREIGN KEY ("string_id") REFERENCES "public"."strings"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "slots" ADD CONSTRAINT "slots_bank_id_banks_id_fk" FOREIGN KEY ("bank_id") REFERENCES "public"."banks"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "slots" ADD CONSTRAINT "slots_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "strings" ADD CONSTRAINT "strings_bank_id_banks_id_fk" FOREIGN KEY ("bank_id") REFERENCES "public"."banks"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "strings" ADD CONSTRAINT "strings_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "strings" ADD CONSTRAINT "strings_family_id_battery_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."battery_families"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tests" ADD CONSTRAINT "tests_battery_id_batteries_id_fk" FOREIGN KEY ("battery_id") REFERENCES "public"."batteries"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tests" ADD CONSTRAINT "tests_string_id_strings_id_fk" FOREIGN KEY ("string_id") REFERENCES "public"."strings"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tests" ADD CONSTRAINT "tests_protocol_id_test_protocols_id_fk" FOREIGN KEY ("protocol_id") REFERENCES "public"."test_protocols"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "warranties" ADD CONSTRAINT "warranties_battery_id_batteries_id_fk" FOREIGN KEY ("battery_id") REFERENCES "public"."batteries"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "assignments_open_slot_uq" ON "assignments" USING btree ("slot_id") WHERE "assignments"."end_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "assignments_open_battery_uq" ON "assignments" USING btree ("battery_id") WHERE "assignments"."end_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assignments_battery_idx" ON "assignments" USING btree ("battery_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_entity_idx" ON "audit_events" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_at_idx" ON "audit_events" USING btree ("at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "batteries_tenant_label_uq" ON "batteries" USING btree ("tenant_id","label");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "batteries_public_ref_uq" ON "batteries" USING btree ("public_ref");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "batteries_serial_idx" ON "batteries" USING btree (lower("manufacturer_serial"));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "batteries_state_idx" ON "batteries" USING btree ("lifecycle_state");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "battery_aliases_value_idx" ON "battery_aliases" USING btree (lower("value"));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "battery_aliases_battery_idx" ON "battery_aliases" USING btree ("battery_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "battery_events_battery_idx" ON "battery_events" USING btree ("battery_id","occurred_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "costs_battery_idx" ON "cost_entries" USING btree ("battery_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "costs_batch_idx" ON "cost_entries" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "evidence_battery_idx" ON "evidence_files" USING btree ("battery_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "import_jobs_hash_idx" ON "import_jobs" USING btree ("file_hash","status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "model_versions_name_version_uq" ON "model_versions" USING btree ("name","version");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "predictions_battery_idx" ON "predictions" USING btree ("battery_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "recycling_battery_uq" ON "recycling_records" USING btree ("battery_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "attempts_battery_no_uq" ON "restoration_attempts" USING btree ("battery_id","attempt_no");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "attempts_one_open_uq" ON "restoration_attempts" USING btree ("battery_id") WHERE "restoration_attempts"."status" IN ('in_restoration', 'awaiting_review');--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "slots_string_position_uq" ON "slots" USING btree ("string_id","position");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tests_battery_idx" ON "tests" USING btree ("battery_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tests_status_idx" ON "tests" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_uq" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_external_subject_uq" ON "users" USING btree ("external_subject");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "warranties_battery_uq" ON "warranties" USING btree ("battery_id");