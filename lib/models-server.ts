/**
 * Server-only model provider resolver.
 *
 * Pricing rows carry `(provider, model)` for every model seen by the daily
 * scraper or set as a workspace override. Looking the provider up there keeps
 * the UI free of slug-prefix heuristics — adding a new model to LiteLLM is
 * enough to identify it everywhere.
 *
 * Returns `Record<slug, provider>`. Slugs absent from pricing are omitted; the
 * caller falls back to `"unknown"` for the icon/label.
 */

import "server-only";

import { db } from "@/lib/db";
import { pricing } from "@/lib/db/schema";
import { inArray } from "drizzle-orm";

export interface ModelProviderResolver {
    (slugs: readonly string[]): Promise<Readonly<Record<string, string>>>;
}

let testResolver: ModelProviderResolver | null = null;

export function setModelProviderResolverForTesting(resolver: ModelProviderResolver | null): void {
    testResolver = resolver;
}

export async function resolveModelProviders(
    slugs: readonly string[],
): Promise<Readonly<Record<string, string>>> {
    if (testResolver !== null) return testResolver(slugs);
    if (slugs.length === 0) return {};
    const rows = await db()
        .selectDistinct({ model: pricing.model, provider: pricing.provider })
        .from(pricing)
        .where(inArray(pricing.model, [...slugs]));
    const out: Record<string, string> = {};
    for (const r of rows) out[r.model] = r.provider;
    return out;
}
