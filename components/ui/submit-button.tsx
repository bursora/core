"use client";

/**
 * Submit button bound to the surrounding <form>'s pending state via
 * useFormStatus. Disables and renders a Loader2 spinner while a server
 * action or form submission is in flight.
 */

import { Button } from "./button";
import { Loader2 } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { useFormStatus } from "react-dom";

type ButtonProps = ComponentProps<typeof Button>;

interface SubmitButtonProps extends Omit<ButtonProps, "type"> {
    readonly children: ReactNode;
    readonly pendingLabel?: string;
    /**
     * Override the pending state. Use this when the surrounding <form> is
     * client-side (react-hook-form) — useFormStatus only fires for native
     * server-action submissions.
     */
    readonly pending?: boolean;
}

export function SubmitButton({
    children,
    pendingLabel,
    disabled,
    pending: pendingProp,
    ...rest
}: SubmitButtonProps) {
    const status = useFormStatus();
    const pending = pendingProp ?? status.pending;
    return (
        <Button type="submit" disabled={disabled || pending} {...rest}>
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
            {pending && pendingLabel ? pendingLabel : children}
        </Button>
    );
}
