CREATE TYPE "public"."network_setup" AS ENUM('router', 'hotspot');--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"sha256" char(64) NOT NULL,
	"mime" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"storage_path" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "official_signatures" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"file_id" uuid NOT NULL,
	"representative_name" text NOT NULL,
	"credential_no" text NOT NULL,
	"position" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "official_stamps" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"file_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"legal_name" text,
	"address" text,
	"max_loading_days_ahead" integer DEFAULT 7 NOT NULL,
	"workday_start" time DEFAULT '07:00' NOT NULL,
	"workday_end" time DEFAULT '19:00' NOT NULL,
	"daily_backup_hour" time DEFAULT '20:00' NOT NULL,
	"external_backup_dir" text,
	"network_setup" "network_setup" DEFAULT 'router' NOT NULL,
	"installation_code_hash" text,
	"deadline_legal_notice" text,
	"current_signature_id" uuid,
	"current_stamp_id" uuid,
	"row_version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "system_settings_single_row" CHECK ("system_settings"."id" = 1),
	CONSTRAINT "system_settings_loading_days" CHECK ("system_settings"."max_loading_days_ahead" BETWEEN 0 AND 30),
	CONSTRAINT "system_settings_workday" CHECK ("system_settings"."workday_start" < "system_settings"."workday_end")
);
--> statement-breakpoint
ALTER TABLE "official_signatures" ADD CONSTRAINT "official_signatures_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "official_signatures" ADD CONSTRAINT "official_signatures_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "official_stamps" ADD CONSTRAINT "official_stamps_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "official_stamps" ADD CONSTRAINT "official_stamps_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_current_signature_id_official_signatures_id_fk" FOREIGN KEY ("current_signature_id") REFERENCES "public"."official_signatures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_current_stamp_id_official_stamps_id_fk" FOREIGN KEY ("current_stamp_id") REFERENCES "public"."official_stamps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- La única fila de la configuración, con los valores por defecto de RF-CFG-02; la app solo la lee y la actualiza.
INSERT INTO "system_settings" ("id") VALUES (1);--> statement-breakpoint
REVOKE INSERT, DELETE, TRUNCATE ON "system_settings" FROM impocaribe_app;--> statement-breakpoint
-- RF-EMP-05: los archivos, las firmas y los cuños no se cambian ni se borran; un reemplazo es una fila nueva y los PDF
-- ya emitidos conservan la suya.
REVOKE UPDATE, DELETE, TRUNCATE ON "files", "official_signatures", "official_stamps" FROM impocaribe_app;
