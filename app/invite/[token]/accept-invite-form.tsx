"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { AlertCircle } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";

export interface AcceptInviteState {
    readonly error: string | null;
}

interface Props {
    readonly token: string;
    readonly action: (prev: AcceptInviteState, formData: FormData) => Promise<AcceptInviteState>;
}

const INITIAL: AcceptInviteState = { error: null };

export function AcceptInviteForm({ token, action }: Props) {
    const [state, formAction] = useActionState(action, INITIAL);
    const lastError = useRef<string | null>(null);

    useEffect(() => {
        if (state.error && state.error !== lastError.current) {
            toast.error(state.error);
            lastError.current = state.error;
        }
    }, [state.error]);

    if (state.error) {
        return (
            <Alert variant="destructive">
                <AlertCircle aria-hidden />
                <AlertTitle>{state.error}</AlertTitle>
                <AlertDescription>Ask the workspace owner to send a fresh invite.</AlertDescription>
            </Alert>
        );
    }

    return (
        <form action={formAction} className="flex flex-col gap-4">
            <input type="hidden" name="token" value={token} />
            <SubmitButton pendingLabel="Joining…" className="w-full">
                Accept invite
            </SubmitButton>
        </form>
    );
}
