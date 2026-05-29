CREATE TABLE "pricing_sync_state" (
	"id" integer PRIMARY KEY NOT NULL,
	"last_synced_at" timestamp with time zone NOT NULL,
	CONSTRAINT "pricing_sync_state_id_check" CHECK ("id" = 1)
);
