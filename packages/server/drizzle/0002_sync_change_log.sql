CREATE TABLE "change_log" (
	"seq" bigint PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"op" text NOT NULL,
	"audience" text NOT NULL,
	"payload" jsonb NOT NULL,
	"ref_date" date,
	"committed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_state" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"last_seq" bigint DEFAULT 0 NOT NULL,
	"epoch" uuid DEFAULT uuid_generate_v7() NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "sync_state_single_row" CHECK ("sync_state"."id" = 1)
);
--> statement-breakpoint
ALTER TABLE "change_log" ADD CONSTRAINT "change_log_op" CHECK ("op" IN ('upsert', 'delete'));
--> statement-breakpoint
-- La única fila de sync_state (plan §4.4).
INSERT INTO "sync_state" DEFAULT VALUES;
--> statement-breakpoint
-- change_log es de solo inserción; solo la depuración de lo que tiene más de 30 días borra filas (plan §4.4).
CREATE TRIGGER change_log_append_only BEFORE UPDATE ON "change_log"
  FOR EACH ROW EXECUTE FUNCTION assert_append_only();
--> statement-breakpoint
REVOKE UPDATE ON "change_log" FROM impocaribe_app;
--> statement-breakpoint
REVOKE INSERT, DELETE, TRUNCATE ON "sync_state" FROM impocaribe_app;
