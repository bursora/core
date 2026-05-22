-- Extend notification_channel_kind enum with 'email'.
--
-- `notification_deliveries` started Slack/Discord-only; email alerts ship
-- through Mailer (SMTP) and now log the same per-attempt row so the
-- channel-health dots cover email too. `target` stores the SHA-256 hash
-- of the email address (raw value never persisted), same shape as the
-- webhook URL hash already used for Slack/Discord.
ALTER TYPE "notification_channel_kind" ADD VALUE IF NOT EXISTS 'email';
