CREATE TABLE "account" (
  "id"                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "account_id"               text NOT NULL,
  "provider_id"              text NOT NULL,
  "user_id"                  uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "access_token"             text,
  "refresh_token"            text,
  "id_token"                 text,
  "access_token_expires_at"  timestamptz,
  "refresh_token_expires_at" timestamptz,
  "scope"                    text,
  "password"                 text,
  "created_at"               timestamptz NOT NULL DEFAULT now(),
  "updated_at"               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX "account_user_id_idx" ON "account" ("user_id");
