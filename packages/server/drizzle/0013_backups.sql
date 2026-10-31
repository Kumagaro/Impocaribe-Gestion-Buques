CREATE TYPE "public"."backup_kind" AS ENUM('hourly', 'daily', 'manual', 'pre_restore');--> statement-breakpoint
CREATE TYPE "public"."backup_status" AS ENUM('running', 'ok', 'failed');--> statement-breakpoint
CREATE TABLE "backups" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"kind" "backup_kind" NOT NULL,
	"status" "backup_status" DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"file_path" text,
	"size_bytes" bigint,
	"sha256" text,
	"error" text,
	"external_path" text,
	"external_copied_at" timestamp with time zone,
	"created_by" uuid
);
--> statement-breakpoint
ALTER TABLE "backups" ADD CONSTRAINT "backups_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- La historia de respaldos no se borra: al vencer la retención solo se quita el archivo (file_path = NULL).
REVOKE DELETE, TRUNCATE ON "backups" FROM impocaribe_app;
