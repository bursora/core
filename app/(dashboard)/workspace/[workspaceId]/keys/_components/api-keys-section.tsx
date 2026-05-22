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
import { ApiKeyRow } from "./api-key-row";
import { IssueApiKeyButton } from "./api-keys-section-controls";
import { IssuedKeyCard } from "./issued-key-card";

interface ApiKeysSectionProps {
    readonly workspaceId: string;
    /** Freshly issued plaintext secret, surfaced once via flash cookie. */
    readonly issuedPlaintext: string | null;
}

export async function ApiKeysSection({ workspaceId, issuedPlaintext }: ApiKeysSectionProps) {
    const keys = await listApiKeys(workspaceId);

    return (
        <div className="space-y-4">
            {issuedPlaintext ? <IssuedKeyCard plaintext={issuedPlaintext} /> : null}

            <DashboardSection
                label="API keys"
                sublabel="shown once at creation · store it somewhere safe"
                actions={<IssueApiKeyButton workspaceId={workspaceId} />}
                bodyClassName="-mx-5"
            >
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Created</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {keys.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={4} className="text-muted-foreground">
                                    No keys issued yet.
                                </TableCell>
                            </TableRow>
                        ) : (
                            keys.map((k) => (
                                <ApiKeyRow
                                    key={k.id}
                                    id={k.id}
                                    name={k.name}
                                    createdLabel={formatDateTime(k.createdAt)}
                                    workspaceId={workspaceId}
                                    initialRevoked={Boolean(k.revokedAt)}
                                />
                            ))
                        )}
                    </TableBody>
                </Table>
            </DashboardSection>
        </div>
    );
}
