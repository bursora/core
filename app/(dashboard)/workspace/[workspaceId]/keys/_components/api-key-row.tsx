"use client";

/**
 * Single API key row with optimistic revoke. The credential (plaintext) is
 * shown exactly once at issuance and never stored, so this row only displays
 * the key id as a reference for identification and revocation — it is not
 * itself the SDK credential.
 */

import { revokeApiKeyAction } from "@/app/(dashboard)/workspace/[workspaceId]/settings/actions";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { StatusTag } from "@/components/ui/workspace/status-tag";
import {
    revokeBadgeLabel,
    revokeReducer,
    type RevokeState,
} from "@/lib/identity/optimistic-revoke";
import { CheckCircle2Icon, CircleSlashIcon, KeyRoundIcon, PencilIcon, Trash2 } from "lucide-react";
import { useOptimistic, useState, useTransition } from "react";
import { DangerConfirm } from "./danger-confirm";
import { RenameApiKeyDialog } from "./rename-api-key-dialog";

interface ApiKeyRowProps {
    readonly id: string;
    readonly name: string;
    readonly createdLabel: string;
    readonly workspaceId: string;
    readonly initialRevoked: boolean;
}

const ID_TAIL_LENGTH = 8;
const idTail = (id: string): string => id.slice(-ID_TAIL_LENGTH);

export function ApiKeyRow({ id, name, createdLabel, workspaceId, initialRevoked }: ApiKeyRowProps) {
    const initial: RevokeState = initialRevoked ? "revoked" : "active";
    const [state, dispatch] = useOptimistic<RevokeState, "begin" | "rollback">(
        initial,
        revokeReducer,
    );
    const [, startTransition] = useTransition();
    const [renaming, setRenaming] = useState(false);

    const isRevoked = state !== "active";

    return (
        <TableRow className={isRevoked ? "opacity-60" : undefined}>
            <TableCell>
                <div className="flex items-center gap-2">
                    <KeyRoundIcon
                        aria-hidden="true"
                        className="size-4 shrink-0 text-muted-foreground"
                    />
                    <div className="flex min-w-0 flex-col">
                        <span className="truncate text-sm font-medium">
                            {name || <span className="text-muted-foreground italic">unnamed</span>}
                        </span>
                        <code
                            className="truncate font-mono text-xs text-muted-foreground"
                            title={id}
                        >
                            …{idTail(id)}
                        </code>
                    </div>
                </div>
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">{createdLabel}</TableCell>
            <TableCell>
                {isRevoked ? (
                    <StatusTag tone="muted" variant="pill">
                        <CircleSlashIcon aria-hidden="true" className="size-3" />
                        {revokeBadgeLabel(state)}
                    </StatusTag>
                ) : (
                    <StatusTag tone="success" variant="pill">
                        <CheckCircle2Icon aria-hidden="true" className="size-3" />
                        {revokeBadgeLabel(state)}
                    </StatusTag>
                )}
            </TableCell>
            <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1">
                    {!initialRevoked ? (
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Rename key ${id}`}
                            onClick={() => setRenaming(true)}
                            disabled={isRevoked}
                        >
                            <PencilIcon
                                aria-hidden="true"
                                className="size-4 text-muted-foreground"
                            />
                        </Button>
                    ) : null}
                    {!initialRevoked ? (
                        <DangerConfirm
                            trigger={
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label={`Revoke key ${id}`}
                                    disabled={isRevoked}
                                >
                                    <Trash2
                                        aria-hidden="true"
                                        className="size-4 text-muted-foreground"
                                    />
                                </Button>
                            }
                            title="Revoke this key?"
                            description="The key will stop working immediately. SDKs using it will start failing on the next request."
                            confirmLabel="Revoke key"
                            successMessage="Key revoked."
                            fields={{ workspaceId, keyId: id }}
                            action={revokeApiKeyAction}
                            onOptimisticBegin={() => {
                                startTransition(() => {
                                    dispatch("begin");
                                });
                            }}
                            onOptimisticRollback={() => {
                                startTransition(() => {
                                    dispatch("rollback");
                                });
                            }}
                        />
                    ) : null}
                </div>
                <RenameApiKeyDialog
                    open={renaming}
                    onOpenChange={setRenaming}
                    keyId={id}
                    workspaceId={workspaceId}
                    currentName={name}
                />
            </TableCell>
        </TableRow>
    );
}
