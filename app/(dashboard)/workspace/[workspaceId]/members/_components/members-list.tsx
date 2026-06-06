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
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTimeZone } from "@/components/ui/hooks/use-time-zone";
import { UserAvatar } from "@/components/ui/user-avatar";
import { EmptyStateCard } from "@/components/ui/workspace/empty-state-card";
import { StatTile } from "@/components/ui/workspace/stat-tile";
import { StatusTag } from "@/components/ui/workspace/status-tag";
import type { ActionResult } from "@/lib/action-result";
import { formatDate } from "@/lib/format";
import type { MemberRole } from "@/lib/identity";
import { USER_STATUS, type UserStatus } from "@/lib/identity/user-status";
import { cn } from "@/lib/utils";
import {
    Clock,
    Mail,
    MoreHorizontal,
    ShieldCheck,
    ShieldOff,
    Trash2,
    UserMinus,
    UserPlus,
    Users,
} from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { InviteForm, type InviteFormState } from "./invite-form";

interface Member {
    readonly userId: string;
    readonly email: string;
    readonly image: string | null;
    readonly role: MemberRole;
    readonly status: UserStatus;
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
    readonly currentUserId: string;
    readonly viewerIsOwner: boolean;
    readonly action: (prev: InviteFormState, formData: FormData) => Promise<InviteFormState>;
    readonly cancelAction: (formData: FormData) => Promise<ActionResult>;
    readonly removeAction: (formData: FormData) => Promise<ActionResult>;
    readonly changeRoleAction: (formData: FormData) => Promise<ActionResult>;
}

export function MembersList({
    members,
    pending,
    currentUserId,
    viewerIsOwner,
    action,
    cancelAction,
    removeAction,
    changeRoleAction,
}: Props) {
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
                        <MemberRow
                            key={m.userId}
                            member={m}
                            isSelf={m.userId === currentUserId}
                            actionable={viewerIsOwner && m.userId !== currentUserId}
                            isLastOwner={m.role === "owner" && counts.owners <= 1}
                            removeAction={removeAction}
                            changeRoleAction={changeRoleAction}
                        />
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

function MemberRow({
    member,
    isSelf,
    actionable,
    isLastOwner,
    removeAction,
    changeRoleAction,
}: {
    member: Member;
    isSelf: boolean;
    actionable: boolean;
    isLastOwner: boolean;
    removeAction: (formData: FormData) => Promise<ActionResult>;
    changeRoleAction: (formData: FormData) => Promise<ActionResult>;
}) {
    const tz = useTimeZone();
    const isOwner = member.role === "owner";
    const isPendingDeletion = member.status === USER_STATUS.pendingDeletion;
    const [pending, startTransition] = useTransition();
    const [confirmRemove, setConfirmRemove] = useState(false);

    const submitRoleChange = (role: MemberRole) => {
        const fd = new FormData();
        fd.set("userId", member.userId);
        fd.set("role", role);
        startTransition(async () => {
            const result = await changeRoleAction(fd);
            if (!result.ok) {
                toast.error(result.error ?? "Failed to update role.");
                return;
            }
            toast.success(
                role === "owner"
                    ? `${member.email} is now an owner.`
                    : `${member.email} is now a member.`,
            );
        });
    };

    const submitRemove = () => {
        const fd = new FormData();
        fd.set("userId", member.userId);
        startTransition(async () => {
            const result = await removeAction(fd);
            if (!result.ok) {
                toast.error(result.error ?? "Failed to remove member.");
                return;
            }
            toast.success(`${member.email} removed from the workspace.`);
        });
    };

    return (
        <li aria-busy={pending || undefined} className={cn(pending && "opacity-60")}>
            <div
                className={cn(
                    "flex flex-wrap items-center justify-between gap-3 rounded-[8px] border p-3",
                    isPendingDeletion
                        ? "border-warning/40 bg-warning/[0.04]"
                        : "border-border bg-background",
                )}
            >
                <div className="flex min-w-0 items-center gap-3">
                    <UserAvatar
                        size="sm"
                        userId={member.userId}
                        name={member.email}
                        image={member.image}
                        className={cn("shrink-0", isPendingDeletion && "opacity-60")}
                    />
                    <div className="min-w-0">
                        <div className="ph-no-capture flex items-center gap-1.5 truncate text-sm font-medium">
                            {member.email}
                            {isSelf ? (
                                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
                                    you
                                </span>
                            ) : null}
                        </div>
                        {isPendingDeletion ? (
                            <div className="flex items-center gap-1 text-xs font-medium text-warning">
                                <Clock className="size-3" />
                                Suspended · deletes within 24h
                            </div>
                        ) : (
                            <div className="text-xs text-muted-foreground">
                                Joined {formatDate(member.createdAt, tz)}
                            </div>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-2">
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
                    {actionable ? (
                        <>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        aria-label={`Manage ${member.email}`}
                                        disabled={pending}
                                        className="ph-no-capture"
                                    >
                                        <MoreHorizontal className="size-4 text-muted-foreground" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    {isOwner ? (
                                        <DropdownMenuItem
                                            disabled={isLastOwner}
                                            onSelect={() => submitRoleChange("member")}
                                        >
                                            <ShieldOff className="size-4" />
                                            Make member
                                        </DropdownMenuItem>
                                    ) : (
                                        <DropdownMenuItem
                                            disabled={isPendingDeletion}
                                            onSelect={() => submitRoleChange("owner")}
                                        >
                                            <ShieldCheck className="size-4" />
                                            Make owner
                                        </DropdownMenuItem>
                                    )}
                                    <DropdownMenuItem
                                        variant="destructive"
                                        disabled={isLastOwner}
                                        onSelect={() => setConfirmRemove(true)}
                                    >
                                        <UserMinus className="size-4" />
                                        Remove from workspace
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                            <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Remove this member?</AlertDialogTitle>
                                        <AlertDialogDescription className="ph-no-capture">
                                            {member.email} loses access to this workspace. Their
                                            usage history stays. You can invite them back later.
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>Keep member</AlertDialogCancel>
                                        <AlertDialogAction
                                            variant="destructive"
                                            onClick={submitRemove}
                                        >
                                            Remove member
                                        </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </>
                    ) : null}
                </div>
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
    const tz = useTimeZone();
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
                        <div className="ph-no-capture truncate text-sm font-medium">
                            {invite.email}
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="size-3" />
                            {expired
                                ? `Expired ${formatDate(invite.expiresAt, tz)}`
                                : `Expires ${formatDate(invite.expiresAt, tz)}`}
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
                                className="ph-no-capture"
                            >
                                <Trash2 className="size-4 text-muted-foreground" />
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Cancel this invite?</AlertDialogTitle>
                                <AlertDialogDescription className="ph-no-capture">
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
