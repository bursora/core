-- usage_events: ClickHouse mirror of the Postgres usage_events table.
-- One row per recorded AI call. Mirrors the current PG column set and
-- semantics (see lib/db/schema.ts usageEvents). Idempotency is enforced
-- at the application layer, so this is a plain MergeTree, NOT a
-- ReplacingMergeTree.
--
-- Single statement: the migration runner splits files on the semicolon
-- character, so this file must contain no other semicolons (comments
-- included).
CREATE TABLE IF NOT EXISTS usage_events (
    id UUID,
    workspace_id UUID,
    -- Facet columns: empty string means the tag was absent on the call.
    -- Kept non-Nullable so the data-skipping indexes below stay clean and
    -- equality/group-by filtering matches dashboard queries.
    tenant_id String DEFAULT '',
    agent_id String DEFAULT '',
    workflow_id String DEFAULT '',
    provider String DEFAULT '',
    model String DEFAULT '',
    prompt_tokens UInt32 DEFAULT 0,
    completion_tokens UInt32 DEFAULT 0,
    cache_tokens UInt32 DEFAULT 0,
    latency_ms Nullable(UInt32),
    -- Money never as Float. PG is numeric(14,8), widened to Decimal(22,8).
    cost_usd Decimal(22, 8),
    -- Optional SDK-supplied id used for app-level dedupe. NULL when absent.
    request_id Nullable(String),
    -- 'ok' = real accepted call, 'blocked' = denied by evaluateBudget.
    status LowCardinality(String) DEFAULT 'ok',
    -- Budget that tripped a 'blocked' row. Plain UUID, no foreign key.
    -- NULL on 'ok' rows.
    decided_by_budget_id Nullable(UUID),
    -- Protocol reason string from evaluateBudget. Set only on 'blocked' rows.
    block_reason Nullable(String),
    -- Pinned to UTC so the zoneless `'YYYY-MM-DD HH:MM:SS.mmm'` insert literal
    -- (always formatted from a UTC instant) parses to the same instant on any
    -- server, and toYYYYMM partitioning is UTC-based. A non-UTC server TZ would
    -- otherwise shift stored instants away from the UTC budget-window bounds.
    ts DateTime64(3, 'UTC'),
    INDEX idx_tenant_id tenant_id TYPE bloom_filter GRANULARITY 1,
    INDEX idx_agent_id agent_id TYPE bloom_filter GRANULARITY 1,
    INDEX idx_workflow_id workflow_id TYPE bloom_filter GRANULARITY 1,
    INDEX idx_provider provider TYPE bloom_filter GRANULARITY 1,
    INDEX idx_model model TYPE bloom_filter GRANULARITY 1
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(ts)
ORDER BY (workspace_id, ts)
