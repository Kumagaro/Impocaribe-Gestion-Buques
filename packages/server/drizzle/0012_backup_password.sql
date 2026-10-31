ALTER TABLE "system_settings" ADD COLUMN "backup_public_key" text;--> statement-breakpoint
ALTER TABLE "system_settings" ADD COLUMN "backup_private_key" jsonb;--> statement-breakpoint
ALTER TABLE "system_settings" ADD COLUMN "backup_password_set_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "system_settings" ADD COLUMN "backup_password_confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "system_settings" ADD COLUMN "backup_confirm_postpones" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "system_settings" ADD COLUMN "backup_confirm_postponed_until" timestamp with time zone;