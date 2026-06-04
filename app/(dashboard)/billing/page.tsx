import { AppShell } from "@/components/shell/app-shell";
import { PageHeader } from "@/components/shell/page-header";
import { requireSessionUI } from "@/lib/auth";
import { env } from "@/lib/env";

interface BillingPageProps {
    searchParams: Promise<{ billing?: string }>;
}

/**
 * Account billing page. Billing is account-level — the subscription gates every
 * workspace the signed-in user owns — so it lives on its own route, not in any
 * one workspace. EE-only and cloud-only: the OSS build drops the module and
 * self-host has no plan, so the section is absent there.
 */
export default async function BillingPage({ searchParams }: BillingPageProps) {
    const session = await requireSessionUI();
    const search = await searchParams;
    const billingStatus =
        search.billing === "ok" || search.billing === "cancel"
            ? (search.billing as "ok" | "cancel")
            : null;

    const isOss = process.env.OSS_BUILD === "true";
    const BillingSection =
        env().IS_CLOUD && !isOss
            ? (await import("@/lib/ee/components/billing-section")).BillingSection
            : null;

    return (
        <AppShell>
            <div className="mx-auto max-w-2xl space-y-6">
                <PageHeader
                    title="Billing"
                    subtitle="Your Bursora Cloud subscription, covering every workspace you own."
                />
                {BillingSection ? (
                    <BillingSection userId={session.user.id} status={billingStatus} />
                ) : (
                    <p className="text-sm text-muted-foreground">
                        Billing is only available on Bursora Cloud.
                    </p>
                )}
            </div>
        </AppShell>
    );
}
