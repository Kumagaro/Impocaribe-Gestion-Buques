CREATE TABLE "carriers" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"name" text NOT NULL,
	"name_normalized" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "carriers_name_normalized_unique" UNIQUE("name_normalized")
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"name" text NOT NULL,
	"name_normalized" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "clients_name_normalized_unique" UNIQUE("name_normalized")
);
--> statement-breakpoint
CREATE TABLE "drivers" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"full_name" text NOT NULL,
	"national_id" char(11) NOT NULL,
	"license_no" char(11) NOT NULL,
	"carrier_id" uuid NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "drivers_national_id_unique" UNIQUE("national_id"),
	CONSTRAINT "drivers_license_no_unique" UNIQUE("license_no"),
	CONSTRAINT "drivers_national_id_digits" CHECK ("drivers"."national_id" ~ '^[0-9]{11}$'),
	CONSTRAINT "drivers_license_digits" CHECK ("drivers"."license_no" ~ '^[0-9]{11}$')
);
--> statement-breakpoint
CREATE TABLE "recipients" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"client_id" uuid NOT NULL,
	"name" text NOT NULL,
	"address" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trailers" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"plate" text NOT NULL,
	"capacity_tons" numeric(12, 3) NOT NULL,
	"carrier_id" uuid NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "trailers_plate_unique" UNIQUE("plate"),
	CONSTRAINT "trailers_capacity" CHECK ("trailers"."capacity_tons" > 0 AND "trailers"."capacity_tons" <= 100)
);
--> statement-breakpoint
CREATE TABLE "truck_default_trailers" (
	"truck_id" uuid NOT NULL,
	"trailer_id" uuid NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "truck_default_trailers_truck_id_trailer_id_pk" PRIMARY KEY("truck_id","trailer_id")
);
--> statement-breakpoint
CREATE TABLE "trucks" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"plate" text NOT NULL,
	"tractor_plate" text,
	"carrier_id" uuid NOT NULL,
	"base_location" text DEFAULT 'LA HABANA' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "trucks_plate_unique" UNIQUE("plate")
);
--> statement-breakpoint
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_carrier_id_carriers_id_fk" FOREIGN KEY ("carrier_id") REFERENCES "public"."carriers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipients" ADD CONSTRAINT "recipients_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trailers" ADD CONSTRAINT "trailers_carrier_id_carriers_id_fk" FOREIGN KEY ("carrier_id") REFERENCES "public"."carriers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "truck_default_trailers" ADD CONSTRAINT "truck_default_trailers_truck_id_trucks_id_fk" FOREIGN KEY ("truck_id") REFERENCES "public"."trucks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "truck_default_trailers" ADD CONSTRAINT "truck_default_trailers_trailer_id_trailers_id_fk" FOREIGN KEY ("trailer_id") REFERENCES "public"."trailers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trucks" ADD CONSTRAINT "trucks_carrier_id_carriers_id_fk" FOREIGN KEY ("carrier_id") REFERENCES "public"."carriers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- RF-CAT-03: no hay camiones activos sin remolque. Se comprueba al confirmar (diferido), para poder cambiar los
-- remolques habituales en la misma transacción que el camión.
CREATE FUNCTION assert_truck_has_trailer() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  truck uuid;
BEGIN
  IF TG_TABLE_NAME = 'trucks' THEN
    truck := NEW.id;
  ELSIF TG_OP = 'DELETE' THEN
    truck := OLD.truck_id;
  ELSE
    truck := NEW.truck_id;
  END IF;
  IF EXISTS (
    SELECT 1 FROM trucks t
    WHERE t.id = truck AND t.active
      AND NOT EXISTS (SELECT 1 FROM truck_default_trailers d WHERE d.truck_id = t.id)
  ) THEN
    RAISE EXCEPTION 'Un camión activo debe tener al menos un remolque habitual (RF-CAT-03).' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;--> statement-breakpoint
CREATE CONSTRAINT TRIGGER trucks_need_trailer AFTER INSERT OR UPDATE ON "trucks"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION assert_truck_has_trailer();--> statement-breakpoint
CREATE CONSTRAINT TRIGGER truck_default_trailers_need_one AFTER DELETE OR UPDATE ON "truck_default_trailers"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION assert_truck_has_trailer();--> statement-breakpoint
-- RF-CAT-07: los catálogos no se borran, se desactivan (los remolques habituales de un camión sí cambian).
REVOKE DELETE, TRUNCATE ON "clients", "recipients", "carriers", "trucks", "trailers", "drivers" FROM impocaribe_app;
