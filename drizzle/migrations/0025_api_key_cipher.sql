ALTER TABLE "api_keys" ADD COLUMN "cipher_text" text;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "cipher_iv" text;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "cipher_auth_tag" text;