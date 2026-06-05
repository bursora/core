CREATE TABLE "cron_run_state" (
	"name" text PRIMARY KEY NOT NULL,
	"last_run_at" timestamp with time zone NOT NULL,
	"last_ok" boolean NOT NULL,
	"last_error" text,
	"last_duration_ms" integer NOT NULL
);
