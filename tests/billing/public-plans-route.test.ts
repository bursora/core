/**
 * GET /api/public/plans — public, unauthenticated pricing feed.
 *
 * The marketing site reads this to render the pricing CTA. It must answer
 * with no session attached, expose only customer-facing plan fields (never
 * internal ids), and carry public cache headers. Self-host installs seed no
 * plans, so the feed is an empty array there.
 */

import { GET, setPlansRepoForTesting } from "@/app/api/public/plans/route";
import { InMemoryPlanRepository } from "@/tests/billing/fakes/in-memory-plan.repository";
import { afterEach, describe, expect, test } from "bun:test";

const request = (): Request => new Request("https://app.test/api/public/plans");

afterEach(() => {
    setPlansRepoForTesting(null);
});

describe("GET /api/public/plans", () => {
    test("returns active plans with only customer-facing fields and no auth", async () => {
        const plans = new InMemoryPlanRepository();
        plans.seed({
            name: "Cloud",
            description: "Bursora Cloud",
            priceCents: 2900,
            currency: "USD",
            interval: "month",
            intervalCount: 1,
            lsVariantId: "variant_seeded",
        });
        setPlansRepoForTesting(plans);

        const response = await GET(request());

        expect(response.status).toBe(200);
        const body = (await response.json()) as unknown[];
        expect(body).toEqual([
            {
                name: "Cloud",
                description: "Bursora Cloud",
                priceCents: 2900,
                currency: "USD",
                interval: "month",
                intervalCount: 1,
                lsVariantId: "variant_seeded",
            },
        ]);
    });

    test("does not leak internal ids or config", async () => {
        const plans = new InMemoryPlanRepository();
        plans.seed({ id: "plan_secret", lsProductId: "prod_secret", config: { floorCents: 2900 } });
        setPlansRepoForTesting(plans);

        const response = await GET(request());
        const serialized = JSON.stringify(await response.json());

        expect(serialized.includes("plan_secret")).toBe(false);
        expect(serialized.includes("prod_secret")).toBe(false);
        expect(serialized.includes("floorCents")).toBe(false);
        expect(serialized.includes("isActive")).toBe(false);
    });

    test("sets public cache headers", async () => {
        setPlansRepoForTesting(new InMemoryPlanRepository());

        const response = await GET(request());

        const cacheControl = response.headers.get("Cache-Control") ?? "";
        expect(cacheControl).toContain("public");
        expect(cacheControl).toContain("s-maxage=");
    });

    test("returns an empty array when no plans are seeded (self-host)", async () => {
        setPlansRepoForTesting(new InMemoryPlanRepository());

        const response = await GET(request());

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual([]);
    });
});
