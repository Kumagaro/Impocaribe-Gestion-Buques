CREATE TYPE "public"."lost_order_status" AS ENUM('pending', 'recovered', 'discarded');--> statement-breakpoint
CREATE TYPE "public"."restore_status" AS ENUM('running', 'ok', 'failed');--> statement-breakpoint
CREATE TABLE "lost_orders" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"restore_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"vessel_id" uuid NOT NULL,
	"number" text NOT NULL,
	"seq" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "lost_order_status" DEFAULT 'pending' NOT NULL,
	"last_error" text,
	"discard_reason" text,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "restores" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"backup_id" uuid NOT NULL,
	"pre_restore_backup_id" uuid,
	"status" "restore_status" DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"error" text,
	"lost_orders" integer DEFAULT 0 NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
ALTER TABLE "system_settings" ADD COLUMN "numbering_confirmation_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "lost_orders" ADD CONSTRAINT "lost_orders_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Historia: ni las restauraciones ni las órdenes perdidas se borran (se recuperan o se descartan con motivo).
REVOKE DELETE, TRUNCATE ON "restores", "lost_orders" FROM impocaribe_app;
