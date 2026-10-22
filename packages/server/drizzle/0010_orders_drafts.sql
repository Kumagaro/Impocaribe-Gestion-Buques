CREATE TYPE "public"."draft_visibility" AS ENUM('private', 'shared');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('official', 'voided');--> statement-breakpoint
CREATE TYPE "public"."order_version_status" AS ENUM('official', 'replaced', 'voided');--> statement-breakpoint
CREATE TABLE "drafts" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"client_draft_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"visibility" "draft_visibility" NOT NULL,
	"payload" jsonb NOT NULL,
	"locked_by" uuid,
	"lock_expires_at" timestamp with time zone,
	"shared_at" timestamp with time zone,
	"updated_at" timestamp with time zone NOT NULL,
	"discarded_at" timestamp with time zone,
	"issued_order_id" uuid,
	CONSTRAINT "drafts_client_draft_id_unique" UNIQUE("client_draft_id")
);
--> statement-breakpoint
CREATE TABLE "load_order_version_trailers" (
	"version_id" uuid NOT NULL,
	"trailer_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"capacity_tons_snapshot" numeric(12, 3) NOT NULL,
	CONSTRAINT "load_order_version_trailers_version_id_trailer_id_pk" PRIMARY KEY("version_id","trailer_id")
);
--> statement-breakpoint
CREATE TABLE "load_order_versions" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"order_id" uuid NOT NULL,
	"version_no" integer NOT NULL,
	"status" "order_version_status" NOT NULL,
	"declaration_version_id" uuid NOT NULL,
	"recipient_id" uuid NOT NULL,
	"truck_id" uuid NOT NULL,
	"driver_id" uuid NOT NULL,
	"tons" numeric(12, 3) NOT NULL,
	"waybill_no" text NOT NULL,
	"lot_no" text,
	"route_sheet_no" text,
	"container" text,
	"loading_date" date NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"issued_by" uuid,
	"issued_device" text,
	"reason" text,
	"capacity_override_reason" text,
	"same_day_override_reason" text,
	"signature_id" uuid NOT NULL,
	"stamp_id" uuid NOT NULL,
	"snapshot" jsonb NOT NULL,
	"pdf_file_id" uuid NOT NULL,
	"pdf_sha256" text NOT NULL,
	CONSTRAINT "load_order_versions_no" UNIQUE("order_id","version_no"),
	CONSTRAINT "load_order_versions_tons_positive" CHECK ("load_order_versions"."tons" > 0),
	CONSTRAINT "load_order_versions_reason" CHECK ("load_order_versions"."version_no" = 1 OR "load_order_versions"."reason" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "load_orders" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"vessel_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"number" text NOT NULL,
	"declaration_id" uuid NOT NULL,
	"allocation_id" uuid NOT NULL,
	"current_version_id" uuid,
	"status" "order_status" NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "load_orders_number_unique" UNIQUE("number"),
	CONSTRAINT "load_orders_vessel_seq" UNIQUE("vessel_id","seq")
);
--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_locked_by_users_id_fk" FOREIGN KEY ("locked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_issued_order_id_load_orders_id_fk" FOREIGN KEY ("issued_order_id") REFERENCES "public"."load_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "load_order_version_trailers" ADD CONSTRAINT "load_order_version_trailers_version_id_load_order_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."load_order_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "load_order_version_trailers" ADD CONSTRAINT "load_order_version_trailers_trailer_id_trailers_id_fk" FOREIGN KEY ("trailer_id") REFERENCES "public"."trailers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "load_order_versions" ADD CONSTRAINT "load_order_versions_order_id_load_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."load_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "load_order_versions" ADD CONSTRAINT "load_order_versions_declaration_version_id_customs_declaration_versions_id_fk" FOREIGN KEY ("declaration_version_id") REFERENCES "public"."customs_declaration_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "load_order_versions" ADD CONSTRAINT "load_order_versions_recipient_id_recipients_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."recipients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "load_order_versions" ADD CONSTRAINT "load_order_versions_truck_id_trucks_id_fk" FOREIGN KEY ("truck_id") REFERENCES "public"."trucks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "load_order_versions" ADD CONSTRAINT "load_order_versions_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "load_order_versions" ADD CONSTRAINT "load_order_versions_issued_by_users_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "load_order_versions" ADD CONSTRAINT "load_order_versions_signature_id_official_signatures_id_fk" FOREIGN KEY ("signature_id") REFERENCES "public"."official_signatures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "load_order_versions" ADD CONSTRAINT "load_order_versions_stamp_id_official_stamps_id_fk" FOREIGN KEY ("stamp_id") REFERENCES "public"."official_stamps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "load_order_versions" ADD CONSTRAINT "load_order_versions_pdf_file_id_files_id_fk" FOREIGN KEY ("pdf_file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "load_orders" ADD CONSTRAINT "load_orders_vessel_id_vessels_id_fk" FOREIGN KEY ("vessel_id") REFERENCES "public"."vessels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "load_orders" ADD CONSTRAINT "load_orders_declaration_id_customs_declarations_id_fk" FOREIGN KEY ("declaration_id") REFERENCES "public"."customs_declarations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "load_orders" ADD CONSTRAINT "load_orders_allocation_id_allocations_id_fk" FOREIGN KEY ("allocation_id") REFERENCES "public"."allocations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "load_order_versions_truck_day" ON "load_order_versions" USING btree ("truck_id","loading_date") WHERE "load_order_versions"."status" = 'official';--> statement-breakpoint
ALTER TABLE "load_orders" ADD CONSTRAINT "load_orders_current_version_fk"
  FOREIGN KEY ("current_version_id") REFERENCES "load_order_versions"("id") DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
-- Const. art. III: una versión emitida no cambia; solo pasa de `official` a `replaced` cuando otra la sustituye.
CREATE FUNCTION assert_order_version_fixed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Las versiones de una orden no se borran (Const. art. III).' USING ERRCODE = '23514';
  END IF;
  IF NOT (OLD.status = 'official' AND NEW.status = 'replaced')
     OR (to_jsonb(NEW) - 'status') IS DISTINCT FROM (to_jsonb(OLD) - 'status') THEN
    RAISE EXCEPTION 'Una versión emitida solo puede pasar de oficial a reemplazada (Const. art. III).'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER load_order_versions_fixed BEFORE UPDATE OR DELETE ON "load_order_versions"
  FOR EACH ROW EXECUTE FUNCTION assert_order_version_fixed();--> statement-breakpoint
CREATE TRIGGER load_order_version_trailers_append_only BEFORE UPDATE OR DELETE ON "load_order_version_trailers"
  FOR EACH ROW EXECUTE FUNCTION assert_append_only();--> statement-breakpoint
REVOKE DELETE, TRUNCATE ON "load_orders", "load_order_versions", "load_order_version_trailers", "drafts"
  FROM impocaribe_app;--> statement-breakpoint
-- RF-BUQ-07: con órdenes emitidas, la fecha de arribo real fija el año y el viaje de números ya impresos.
CREATE FUNCTION assert_arrival_locked() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.arrival_date IS DISTINCT FROM OLD.arrival_date
     AND EXISTS (SELECT 1 FROM load_orders o WHERE o.vessel_id = NEW.id) THEN
    RAISE EXCEPTION 'El buque ya tiene órdenes: su fecha de arribo real no cambia (RF-BUQ-07).' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER vessels_arrival_locked BEFORE UPDATE OF arrival_date ON "vessels"
  FOR EACH ROW EXECUTE FUNCTION assert_arrival_locked();--> statement-breakpoint
-- Plan §4.3: lo cargado es la suma de la versión vigente de cada orden oficial de la asignación (spec §6).
CREATE OR REPLACE VIEW v_allocation_balance AS
SELECT a.id AS allocation_id, a.declaration_id, a.vessel_id, a.allocated_tons,
       COALESCE(sum(v.tons) FILTER (WHERE v.status = 'official'), 0)::numeric(12,3) AS loaded_tons,
       (a.allocated_tons - COALESCE(sum(v.tons) FILTER (WHERE v.status = 'official'), 0))::numeric(12,3) AS balance_tons
FROM allocations a
LEFT JOIN load_orders o ON o.allocation_id = a.id
LEFT JOIN load_order_versions v ON v.id = o.current_version_id
GROUP BY a.id;
