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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteAccountAction } from "../actions";

interface DeleteAccountCardProps {
    readonly email: string;
}

export function DeleteAccountCard({ email }: DeleteAccountCardProps) {
    const router = useRouter();
    const [confirmation, setConfirmation] = useState("");
    const [pending, startTransition] = useTransition();
    const matches = confirmation.trim().toLowerCase() === email.toLowerCase();

    const onConfirm = () => {
        const fd = new FormData();
        fd.set("confirmEmail", confirmation);
        startTransition(async () => {
            const result = await deleteAccountAction(fd);
            if (!result.ok) {
                toast.error(result.error ?? "Could not delete your account.");
                return;
            }
            await authClient.signOut().catch(() => {});
            router.replace("/account-deleted");
            router.refresh();
        });
    };

    return (
        <Card className="border-destructive/40">
            <CardHeader>
                <CardTitle>Delete account</CardTitle>
                <CardDescription>
                    Suspends your account right away, then permanently deletes it in 24 hours, along
                    with any workspace you solely own and its API keys, budgets, and usage history.
                    Shared workspaces stay; if you&apos;re their only owner, pass ownership to
                    another member first. Change your mind? Sign back in within 24 hours to cancel.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <AlertDialog
                    onOpenChange={(open) => {
                        if (!open) setConfirmation("");
                    }}
                >
                    <AlertDialogTrigger asChild>
                        <Button type="button" variant="destructive">
                            Delete account
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Delete your account?</AlertDialogTitle>
                            <AlertDialogDescription>
                                Your account is suspended now and signed out everywhere, then
                                permanently deleted in 24 hours with every workspace you alone own.
                                Shared workspaces stay; if you&apos;re their only owner, make
                                another member an owner first. Sign back in within 24 hours to
                                cancel.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <div className="space-y-2 py-2">
                            <Label htmlFor="confirm-account-email">
                                Type{" "}
                                <code className="rounded bg-muted px-1 font-mono text-xs">
                                    {email}
                                </code>{" "}
                                to confirm.
                            </Label>
                            <Input
                                id="confirm-account-email"
                                value={confirmation}
                                onChange={(e) => setConfirmation(e.target.value)}
                                autoComplete="off"
                            />
                        </div>
                        <AlertDialogFooter>
                            <AlertDialogCancel type="button" disabled={pending}>
                                Cancel
                            </AlertDialogCancel>
                            <AlertDialogAction
                                variant="destructive"
                                disabled={!matches || pending}
                                onClick={(e) => {
                                    e.preventDefault();
                                    onConfirm();
                                }}
                            >
                                Delete account
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </CardContent>
        </Card>
    );
}
