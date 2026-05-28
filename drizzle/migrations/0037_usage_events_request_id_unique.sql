-- Make the events ingest path idempotent per `requestId`.
--
-- The SDK retries (transient 5xx, customer code re-runs) can deliver the same
-- usage event twice. Without a uniqueness rule, both rows land and the
-- customer is billed twice. Partial unique on `(workspace_id, request_id)`
-- restricted to rows where `request_id IS NOT NULL` lets retries collapse via
-- `ON CONFLICT DO NOTHING` while leaving the optional-requestId rows
-- untouched (NULLs are ignored by the WHERE clause).
--
-- Tenant isolation: the index keys on `workspace_id` first, so two workspaces
-- can re-use the same `requestId` without colliding.
--
-- Cleanup pass: any historical duplicates (same workspace_id + request_id)
-- predate the constraint. Keep the earliest row per duplicate set and drop
-- the rest so the new index can be created without a violation.
WITH ranked AS (
    SELECT id, ts,
           row_number() OVER (
               PARTITION BY workspace_id, request_id
               ORDER BY ts ASC, id ASC
           ) AS rn
    FROM "usage_events"
    WHERE request_id IS NOT NULL
)
DELETE FROM "usage_events" ue
USING ranked r
WHERE ue.id = r.id
  AND ue.ts = r.ts
  AND r.rn > 1;

CREATE UNIQUE INDEX "usage_events_workspace_request_uidx"
    ON "usage_events" ("workspace_id", "request_id")
    WHERE "request_id" IS NOT NULL;
