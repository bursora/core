import { PageHeader } from "@/components/shell/page-header";
import { CloudPaywall } from "@/components/ui/workspace/cloud-paywall";

interface CloudPaywallPageProps {
    readonly workspaceId: string;
    readonly title: string;
    readonly subtitle?: string;
}

/**
 * Full-page locked state for a gated workspace surface: the page header plus
 * the blurred paywall. Every gated page returns this from its
 * `cloudWorkspaceLocked` branch, passing only its static title/subtitle and the
 * workspace id — never fetched data. The wrapper is standardized so locked
 * pages render consistently regardless of the surface.
 */
export function CloudPaywallPage({ workspaceId, title, subtitle }: CloudPaywallPageProps) {
    return (
        <section className="flex flex-col gap-6">
            <PageHeader title={title} {...(subtitle !== undefined ? { subtitle } : {})} />
            <CloudPaywall workspaceId={workspaceId} />
        </section>
    );
}
