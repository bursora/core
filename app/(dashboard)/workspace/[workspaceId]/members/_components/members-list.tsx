"use client";

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { UserAvatar } from "@/components/ui/user-avatar";
import { EmptyStateCard } from "@/components/ui/workspace/empty-state-card";
import { StatTile } from "@/components/ui/workspace/stat-tile";
import { StatusTag } from "@/components/ui/workspace/status-tag";
import type { ActionResult } from "@/lib/action-result";
import { formatDate } from "@/lib/format";
import type { MemberRole } from "@/lib/identity";
import { cn } from "@/lib/utils";
import { Clock, Mail, ShieldCheck, Trash2, UserPlus, Users } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { InviteForm, type InviteFormState } from "./invite-form";

interface Member {
    readonly userId: string;
    readonly email: string;
    readonly role: MemberRole;
    readonly createdAt: Date;
}

interface PendingInvite {
    readonly email: string;
    readonly role: MemberRole;
    readonly createdAt: Date;
    readonly expiresAt: Date;
}

interface Props {
    readonly members: readonly Member[];
    readonly pending: readonly PendingInvite[];
    readonly action: (prev: InviteFormState, formData: FormData) => Promise<InviteFormState>;
    readonly cancelAction: (formData: FormData) => Promise<ActionResult>;
}

export function MembersList({ members, pending, action, cancelAction }: Props) {
    const [open, setOpen] = useState(false);

    const counts = useMemo(() => {
        let owners = 0;
        for (const m of members) if (m.role === "owner") owners += 1;
        return { total: members.length, owners, members: members.length - owners };
    }, [members]);

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <p className="max-w-xl text-sm text-muted-foreground">
                    Invite teammates by email. Owners can manage billing and access; members can use
                    the workspace.
                </p>
                <Dialog open={open} onOpenChange={setOpen}>
                    <DialogTrigger asChild>
                        <Button size="sm">
                            <UserPlus className="size-4" />
                            Invite member
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Invite member</DialogTitle>
                            <DialogDescription>
                                Send an invitation link. The invite expires in 7 days.
                            </DialogDescription>
                        </DialogHeader>
                        <InviteForm action={action} onInvited={() => setOpen(false)} />
                    </DialogContent>
                </Dialog>
            </div>

            <div className="grid grid-cols-3 gap-3">
                <StatTile label="Total" value={counts.total} tone="muted" />
                <StatTile label="Owners" value={counts.owners} tone="foreground" />
                <StatTile label="Pending" value={pending.length} tone="warning" />
            </div>

            {members.length === 0 ? (
                <EmptyStateCard
                    icon={Users}
                    title="No teammates yet"
                    description="Invite someone by email to give them access to this workspace."
                    action={{
                        label: "Invite first member",
                        icon: UserPlus,
                        onClick: () => setOpen(true),
                    }}
                />
            ) : (
                <ul className="space-y-3">
                    {members.map((m) => (
                        <MemberRow key={m.userId} member={m} />
                    ))}
                </ul>
            )}

            {pending.length > 0 ? (
                <div className="space-y-3">
                    <h4 className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground/70">
                        Pending invites
                    </h4>
                    <ul className="space-y-3">
                        {pending.map((p) => (
                            <PendingRow
                                key={`${p.email}-${p.createdAt.getTime()}`}
                                invite={p}
                                cancelAction={cancelAction}
                            />
                        ))}
                    </ul>
                </div>
            ) : null}
        </div>
    );
}

function MemberRow({ member }: { member: Member }) {
    const isOwner = member.role === "owner";

    return (
        <li>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-border bg-background p-3">
                <div className="flex min-w-0 items-center gap-3">
                    <UserAvatar
                        size="sm"
                        userId={member.userId}
                        name={member.email}
                        className="shrink-0"
                    />
                    <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{member.email}</div>
                        <div className="text-xs text-muted-foreground">
                            Joined {formatDate(member.createdAt)}
                        </div>
                    </div>
                </div>
                {isOwner ? (
                    <StatusTag tone="foreground" variant="pill">
                        <ShieldCheck className="size-3" />
                        owner
                    </StatusTag>
                ) : (
                    <StatusTag tone="muted" variant="pill">
                        member
                    </StatusTag>
                )}
            </div>
        </li>
    );
}

function PendingRow({
    invite,
    cancelAction,
}: {
    invite: PendingInvite;
    cancelAction: (formData: FormData) => Promise<ActionResult>;
}) {
    const [pending, startTransition] = useTransition();
    // Wall-clock comparison; intentional re-evaluation each render so a Pending
    // invite flips to Expired the moment the deadline passes without needing a
    // timer or external trigger.
    // eslint-disable-next-line react-hooks/purity
    const expired = invite.expiresAt.getTime() < Date.now();

    const onConfirm = () => {
        const fd = new FormData();
        fd.set("email", invite.email);
        startTransition(async () => {
            const result = await cancelAction(fd);
            if (!result.ok) {
                toast.error(result.error ?? "Failed to cancel invite.");
                return;
            }
            toast.success(`Invitation to ${invite.email} canceled.`);
        });
    };

    return (
        <li aria-busy={pending || undefined} className={cn(pending && "opacity-60")}>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-border bg-background p-3">
                <div className="flex min-w-0 items-center gap-3">
                    <div
                        aria-hidden
                        className="grid size-9 shrink-0 place-items-center rounded-full bg-warning/10 text-warning"
                    >
                        <Mail className="size-4" />
                    </div>
                    <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{invite.email}</div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="size-3" />
                            {expired
                                ? `Expired ${formatDate(invite.expiresAt)}`
                                : `Expires ${formatDate(invite.expiresAt)}`}
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <StatusTag tone={expired ? "destructive" : "warning"} variant="pill">
                        {expired ? "expired" : "pending"}
                        <span className="text-muted-foreground">·</span>
                        {invite.role === "owner" ? "owner" : "member"}
                    </StatusTag>
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`Cancel invite to ${invite.email}`}
                                disabled={pending}
                            >
                                <Trash2 className="size-4 text-muted-foreground" />
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Cancel this invite?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    Revokes the pending invitation for {invite.email}. The link in
                                    their email will stop working.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Keep invite</AlertDialogCancel>
                                <AlertDialogAction variant="destructive" onClick={onConfirm}>
                                    Cancel invite
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>
            </div>
        </li>
    );
}
