import { PageHeader } from "@/components/shell/page-header";
import { CloudPaywall } from "@/components/ui/workspace/cloud-paywall";
import { requireSessionUI } from "@/lib/auth";
import { resolveCloudPaywallData } from "./cloud-paywall-data";

interface CloudPaywallPageProps {
    readonly workspaceId: string;
    readonly title: string;
    readonly subtitle?: string;
}

/**
 * Full-page locked state for a gated workspace surface: the page header plus
 * the upgrade paywall. Every gated page returns this from its
 * `cloudWorkspaceLocked` branch, passing only its static title/subtitle and the
 * workspace id — never fetched data. Owner detection, plan price/bullets, and
 * the user-scoped checkout action are resolved in `resolveCloudPaywallData`.
 */
export async function CloudPaywallPage({ workspaceId, title, subtitle }: CloudPaywallPageProps) {
    const session = await requireSessionUI();
    const paywall = await resolveCloudPaywallData(workspaceId, session.user.id);

    return (
        <section className="flex flex-col gap-6">
            <PageHeader title={title} {...(subtitle !== undefined ? { subtitle } : {})} />
            <CloudPaywall workspaceId={workspaceId} {...paywall} />
        </section>
    );
}
