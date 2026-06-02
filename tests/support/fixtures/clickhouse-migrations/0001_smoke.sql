CREATE TABLE smoke_events (
    id String,
    amount UInt32
) ENGINE = MergeTree
ORDER BY id;
