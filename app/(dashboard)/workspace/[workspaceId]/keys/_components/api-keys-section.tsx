/**
 * API keys section rendered by the dedicated
 * /workspace/[workspaceId]/keys route.
 */

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { DashboardSection } from "@/components/ui/workspace/dashboard-section";
import { formatDateTime } from "@/lib/format";
import { listApiKeys } from "@/lib/identity/server";
import { getRequestTimeZone } from "@/lib/time/request-tz";
import { ApiKeyRow } from "./api-key-row";
import { IssueApiKeyButton } from "./api-keys-section-controls";
import { IssuedKeyCard } from "./issued-key-card";

interface ApiKeysSectionProps {
    readonly workspaceId: string;
    /** Freshly issued plaintext secret, surfaced once via flash cookie. */
    readonly issuedPlaintext: string | null;
    /** Open the issue-key dialog on mount (arriving from the spend empty state). */
    readonly autoIssue: boolean;
}

export async function ApiKeysSection({
    workspaceId,
    issuedPlaintext,
    autoIssue,
}: ApiKeysSectionProps) {
    const keys = await listApiKeys(workspaceId);
    const tz = await getRequestTimeZone();

    return (
        <div className="space-y-4">
            {issuedPlaintext ? <IssuedKeyCard plaintext={issuedPlaintext} /> : null}

            <DashboardSection
                label="API keys"
                sublabel="reveal and copy a key any time · keep it server-side"
                actions={<IssueApiKeyButton workspaceId={workspaceId} autoOpen={autoIssue} />}
                bodyClassName="-mx-5"
            >
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Key</TableHead>
                            <TableHead>Created</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {keys.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="text-muted-foreground">
                                    No keys issued yet.
                                </TableCell>
                            </TableRow>
                        ) : (
                            keys.map((k) => (
                                <ApiKeyRow
                                    key={k.id}
                                    id={k.id}
                                    name={k.name}
                                    createdLabel={formatDateTime(k.createdAt, tz)}
                                    workspaceId={workspaceId}
                                    initialRevoked={Boolean(k.revokedAt)}
                                    revealable={k.revealable}
                                    last6={k.last6}
                                />
                            ))
                        )}
                    </TableBody>
                </Table>
            </DashboardSection>
        </div>
    );
}
