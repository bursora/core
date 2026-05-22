CREATE TABLE "session" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "expires_at" timestamptz NOT NULL,
  "token"      text NOT NULL UNIQUE,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "ip_address" text,
  "user_agent" text,
  "user_id"    uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE INDEX "session_user_id_idx"    ON "session" ("user_id");
CREATE INDEX "session_expires_at_idx" ON "session" ("expires_at");
