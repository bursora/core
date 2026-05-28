/**
 * Tests for serialize/deserialize helpers covering the activity-feed URL
 * params shared between the Settings → Activity tab (page mode: from/to) and
 * the internal activity API route (range mode). Both helpers operate on
 * `URLSearchParams` so the round-trip works against the same shape the
 * browser hands the router.
 */

import {
    ACTIVITY_KIND_VALUES,
    ACTIVITY_RANGE_VALUES,
    ACTIVITY_SEVERITY_VALUES,
    deserializeActivityFilters,
    serializeActivityFilters,
    type ActivityFilterParams,
} from "@/lib/metering/activity-filter-params";
import { describe, expect, test } from "bun:test";

describe("serializeActivityFilters", () => {
    test("empty params yield an empty URL (no defaults polluted in)", () => {
        const out = serializeActivityFilters({});
        expect(out.toString()).toBe("");
    });

    test("includes only the keys that were set", () => {
        const out = serializeActivityFilters({ kind: "alert_raised" });
        expect(out.toString()).toBe("kind=alert_raised");
    });

    test("serializes from/to as ISO strings", () => {
        const from = new Date("2025-05-10T00:00:00.000Z");
        const to = new Date("2025-05-17T00:00:00.000Z");
        const out = serializeActivityFilters({ from, to });
        expect(out.get("from")).toBe("2025-05-10T00:00:00.000Z");
        expect(out.get("to")).toBe("2025-05-17T00:00:00.000Z");
    });

    test("omits keys that are absent", () => {
        // `exactOptionalPropertyTypes` means callers can't pass `undefined`;
        // they omit the key. The serializer must not invent keys for them.
        const out = serializeActivityFilters({ kind: "alert_raised" });
        expect(out.has("severity")).toBe(false);
        expect(out.has("range")).toBe(false);
        expect(out.has("from")).toBe(false);
        expect(out.has("to")).toBe(false);
        expect(out.has("cursor")).toBe(false);
    });
});

describe("deserializeActivityFilters", () => {
    test("empty input yields empty params", () => {
        const params = deserializeActivityFilters(new URLSearchParams());
        expect(params).toEqual({});
    });

    test("parses a valid kind", () => {
        const params = deserializeActivityFilters(new URLSearchParams("kind=alert_raised"));
        expect(params.kind).toBe("alert_raised");
    });

    test("drops unknown kind", () => {
        const params = deserializeActivityFilters(new URLSearchParams("kind=bogus"));
        expect(params.kind).toBeUndefined();
    });

    test("drops unknown severity", () => {
        const params = deserializeActivityFilters(new URLSearchParams("severity=meh"));
        expect(params.severity).toBeUndefined();
    });

    test("drops unknown range", () => {
        const params = deserializeActivityFilters(new URLSearchParams("range=99d"));
        expect(params.range).toBeUndefined();
    });

    test("parses from/to as Date when ISO is valid", () => {
        const params = deserializeActivityFilters(
            new URLSearchParams(
                "from=2025-05-10T00:00:00.000Z&to=2025-05-17T00:00:00.000Z",
            ),
        );
        expect(params.from?.toISOString()).toBe("2025-05-10T00:00:00.000Z");
        expect(params.to?.toISOString()).toBe("2025-05-17T00:00:00.000Z");
    });

    test("drops invalid from/to", () => {
        const params = deserializeActivityFilters(
            new URLSearchParams("from=not-a-date&to=also-bad"),
        );
        expect(params.from).toBeUndefined();
        expect(params.to).toBeUndefined();
    });

    test("ignores unknown keys", () => {
        const params = deserializeActivityFilters(
            new URLSearchParams("kind=alert_raised&surprise=42"),
        );
        expect(params).toEqual({ kind: "alert_raised" });
    });

    test("accepts numeric cursor", () => {
        const params = deserializeActivityFilters(new URLSearchParams("cursor=1700000000000"));
        expect(params.cursor).toBe("1700000000000");
    });

    test("drops non-numeric cursor", () => {
        const params = deserializeActivityFilters(new URLSearchParams("cursor=abc"));
        expect(params.cursor).toBeUndefined();
    });
});

describe("round-trip serialize → deserialize", () => {
    test("kind + severity + cursor", () => {
        const original: ActivityFilterParams = {
            kind: "alert_raised",
            severity: "critical",
            cursor: "1700000000000",
        };
        const round = deserializeActivityFilters(serializeActivityFilters(original));
        expect(round).toEqual(original);
    });

    test("range mode", () => {
        const original: ActivityFilterParams = { range: "7d", kind: "event_ingested" };
        const round = deserializeActivityFilters(serializeActivityFilters(original));
        expect(round).toEqual(original);
    });

    test("from/to mode", () => {
        const original: ActivityFilterParams = {
            from: new Date("2025-05-10T00:00:00.000Z"),
            to: new Date("2025-05-17T00:00:00.000Z"),
        };
        const round = deserializeActivityFilters(serializeActivityFilters(original));
        expect(round.from?.toISOString()).toBe(original.from?.toISOString());
        expect(round.to?.toISOString()).toBe(original.to?.toISOString());
    });

    test("every kind value round-trips", () => {
        for (const kind of ACTIVITY_KIND_VALUES) {
            const round = deserializeActivityFilters(serializeActivityFilters({ kind }));
            expect(round.kind).toBe(kind);
        }
    });

    test("every severity value round-trips", () => {
        for (const severity of ACTIVITY_SEVERITY_VALUES) {
            const round = deserializeActivityFilters(serializeActivityFilters({ severity }));
            expect(round.severity).toBe(severity);
        }
    });

    test("every range value round-trips", () => {
        for (const range of ACTIVITY_RANGE_VALUES) {
            const round = deserializeActivityFilters(serializeActivityFilters({ range }));
            expect(round.range).toBe(range);
        }
    });
});
