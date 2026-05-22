"use client";

/**
 * Invite-by-email form. Calls the supplied server action via useActionState
 * so we can surface errors via toast and reset the input on success.
 */

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichSelect, type RichSelectItem } from "@/components/ui/rich-select";
import { SubmitButton } from "@/components/ui/submit-button";
import type { MemberRole } from "@/lib/identity";
import { ShieldCheck, User } from "lucide-react";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";

const ROLE_ITEMS: readonly RichSelectItem<MemberRole>[] = [
    {
        value: "member",
        label: "Member",
        description: "Can view dashboards and manage budgets",
        Icon: User,
    },
    {
        value: "owner",
        label: "Owner",
        description: "Full access including billing and team",
        Icon: ShieldCheck,
    },
];

export interface InviteFormState {
    readonly error: string | null;
    readonly invitedEmail: string | null;
}

const INITIAL: InviteFormState = { error: null, invitedEmail: null };

interface Props {
    readonly action: (prev: InviteFormState, formData: FormData) => Promise<InviteFormState>;
    readonly onInvited?: () => void;
}

export function InviteForm({ action, onInvited }: Props) {
    const [state, formAction] = useActionState(action, INITIAL);
    const [role, setRole] = useState<MemberRole>("member");
    const formRef = useRef<HTMLFormElement>(null);
    const emailId = useId();
    const errorId = useId();
    const lastError = useRef<string | null>(null);
    const lastInvited = useRef<string | null>(null);

    useEffect(() => {
        if (state.error && state.error !== lastError.current) {
            toast.error(state.error);
            lastError.current = state.error;
        }
    }, [state.error]);

    useEffect(() => {
        if (state.invitedEmail && state.invitedEmail !== lastInvited.current) {
            toast.success(`Invitation sent to ${state.invitedEmail}.`);
            lastInvited.current = state.invitedEmail;
            formRef.current?.reset();
            setRole("member");
            onInvited?.();
        }
    }, [state.invitedEmail, onInvited]);

    return (
        <form ref={formRef} action={formAction} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
                <Label htmlFor={emailId}>Email</Label>
                <Input
                    id={emailId}
                    name="email"
                    type="email"
                    required
                    autoComplete="off"
                    placeholder="teammate@acme.test"
                    aria-invalid={state.error ? true : undefined}
                    aria-describedby={state.error ? errorId : undefined}
                />
                {state.error ? (
                    <p id={errorId} className="text-sm text-destructive">
                        {state.error}
                    </p>
                ) : null}
            </div>
            <div className="flex flex-col gap-2">
                <Label htmlFor="role">Role</Label>
                <RichSelect<MemberRole>
                    id="role"
                    name="role"
                    value={role}
                    onValueChange={setRole}
                    items={ROLE_ITEMS}
                />
            </div>
            <SubmitButton className="self-end" pendingLabel="Sending…">
                Send invite
            </SubmitButton>
        </form>
    );
}
