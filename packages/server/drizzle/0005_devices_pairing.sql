CREATE TABLE "devices" (
	"id" text PRIMARY KEY DEFAULT uuid_generate_v7()::text NOT NULL,
	"name" text NOT NULL,
	"platform" text NOT NULL,
	"app_version" text,
	"secret" text NOT NULL,
	"paired_at" timestamp with time zone NOT NULL,
	"paired_method" text NOT NULL,
	"last_seen_at" timestamp with time zone,
	"clock_offset_ms" bigint DEFAULT 0 NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by" uuid,
	CONSTRAINT "devices_platform" CHECK ("devices"."platform" IN ('windows', 'android')),
	CONSTRAINT "devices_paired_method" CHECK ("devices"."paired_method" IN ('code', 'qr', 'local'))
);
--> statement-breakpoint
CREATE TABLE "pairing_qr_tokens" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"device_id" text
);
--> statement-breakpoint
CREATE TABLE "pairing_requests" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"device_name" text NOT NULL,
	"platform" text NOT NULL,
	"client_nonce" text NOT NULL,
	"server_nonce" text NOT NULL,
	"code" char(6) NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone,
	"device_id" text,
	CONSTRAINT "pairing_requests_status" CHECK ("pairing_requests"."status" IN ('pending', 'confirmed', 'rejected', 'expired'))
);
--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pairing_qr_tokens" ADD CONSTRAINT "pairing_qr_tokens_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pairing_requests" ADD CONSTRAINT "pairing_requests_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- RF-RED-05: un dispositivo revocado no se borra, se marca; para volver a usarlo se empareja de nuevo.
REVOKE DELETE, TRUNCATE ON "devices" FROM impocaribe_app;
