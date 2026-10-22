CREATE TYPE "public"."alert_kind" AS ENUM('condition', 'event');--> statement-breakpoint
CREATE TYPE "public"."alert_status" AS ENUM('open', 'resolved', 'attended');--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"type" text NOT NULL,
	"kind" "alert_kind" NOT NULL,
	"dedupe_key" text,
	"audience_roles" text[] NOT NULL,
	"target_user_id" uuid,
	"entity_type" text,
	"entity_id" text,
	"title" text NOT NULL,
	"detail" text NOT NULL,
	"payload" jsonb,
	"status" "alert_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone,
	"attended_by" uuid,
	"attended_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_attended_by_users_id_fk" FOREIGN KEY ("attended_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "alerts_open_dedupe" ON "alerts" USING btree ("dedupe_key") WHERE "alerts"."status" = 'open';--> statement-breakpoint
-- RF-ALR-01 · plan §6.4: aviso inmediato de una alerta nueva; NOTIFY se entrega solo al confirmar.
CREATE FUNCTION notify_alert() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('impocaribe_alert', json_build_object(
    'id', NEW.id, 'type', NEW.type, 'title', NEW.title,
    'roles', NEW.audience_roles, 'target', NEW.target_user_id)::text);
  RETURN NULL;
END $$;--> statement-breakpoint
CREATE TRIGGER alerts_notify AFTER INSERT ON "alerts" FOR EACH ROW EXECUTE FUNCTION notify_alert();--> statement-breakpoint
REVOKE DELETE, TRUNCATE ON "alerts" FROM impocaribe_app;
