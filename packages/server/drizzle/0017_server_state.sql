CREATE TYPE "public"."server_state" AS ENUM('active', 'migrated');--> statement-breakpoint
ALTER TABLE "system_settings" ADD COLUMN "server_state" "server_state" DEFAULT 'active' NOT NULL;