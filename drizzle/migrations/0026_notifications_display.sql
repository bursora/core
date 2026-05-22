-- Surface flag for the workspace banner pipeline. Notifications with
-- display='banner' render as a workspace-wide strip in addition to the bell
-- list; 'inline' (default) shows only in the bell. The fan-out writers tag
-- the row at insert time based on source/severity; no recomputation.
ALTER TABLE "notifications"
    ADD COLUMN "display" text NOT NULL DEFAULT 'inline';
