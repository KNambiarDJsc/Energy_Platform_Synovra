ALTER TABLE "evidence_files" ADD COLUMN "content_type" text;--> statement-breakpoint
ALTER TABLE "evidence_files" ADD COLUMN "scan_status" text;--> statement-breakpoint
ALTER TABLE "evidence_files" ADD CONSTRAINT "evidence_stored_consistent_ck" CHECK ("evidence_files"."storage_key" IS NULL
    OR ("evidence_files"."storage_key" = 'sha256/' || "evidence_files"."checksum" AND "evidence_files"."content_type" IS NOT NULL AND "evidence_files"."scan_status" IS NOT NULL));