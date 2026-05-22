/**
 * Unit tests for the pricing-based model→provider resolver.
 *
 * The resolver consults the `pricing` table — the same data the scraper writes
 * daily — so adding a model there is enough to label it across the UI.
 * Slugs absent from pricing must be omitted (callers fall back to "unknown"),
 * never returned with a stale or guessed provider.
 */

import { resolveModelProviders, setModelProviderResolverForTesting } from "@/lib/models-server";
import { afterEach, describe, expect, test } from "bun:test";

afterEach(() => {
    setModelProviderResolverForTesting(null);
});

describe("resolveModelProviders", () => {
    test("returns an empty map when no slugs are requested", async () => {
        const out = await resolveModelProviders([]);
        expect(out).toEqual({});
    });

    test("maps known slugs to their provider via the test seam", async () => {
        setModelProviderResolverForTesting(async (slugs) => {
            const table: Record<string, string> = {
                "gpt-4o": "openai",
                "claude-3-5-sonnet": "anthropic",
            };
            return Object.fromEntries(
                slugs.filter((s) => s in table).map((s) => [s, table[s] as string]),
            );
        });

        const out = await resolveModelProviders(["gpt-4o", "claude-3-5-sonnet", "unknown-model"]);
        expect(out).toEqual({
            "gpt-4o": "openai",
            "claude-3-5-sonnet": "anthropic",
        });
        expect(out).not.toHaveProperty("unknown-model");
    });
});
