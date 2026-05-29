import { readIssuedKey } from "@/app/(dashboard)/workspace/[workspaceId]/settings/issued-key-cookie";
import { PageHeader } from "@/components/shell/page-header";
import { KEYS_FROM_SPEND_EMPTY } from "@/lib/routes";
import { ApiKeysSection } from "./_components/api-keys-section";

interface PageProps {
    params: Promise<{ workspaceId: string }>;
    searchParams: Promise<{ from?: string }>;
}

export default async function ApiKeysPage({ params, searchParams }: PageProps) {
    const { workspaceId } = await params;
    // Membership is guarded by the parent workspace layout.

    const { from } = await searchParams;
    const issued = await readIssuedKey();

    return (
        <section>
            <PageHeader
                title="API keys"
                subtitle="Issue and revoke keys used by your SDKs to send metering events."
            />
            <ApiKeysSection
                workspaceId={workspaceId}
                issuedPlaintext={issued}
                autoIssue={from === KEYS_FROM_SPEND_EMPTY}
            />
        </section>
    );
}
