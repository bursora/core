"use client";

/**
 * Masked key cell with copy-only access. The plaintext is never rendered or
 * sent to the page on load; clicking Copy fetches it on demand through
 * `revealApiKeyAction` (which decrypts server-side and audits the access) and
 * writes it straight to the clipboard. The key is never shown on screen — the
 * cell only ever displays the masked `bsk_••••••••••••<last6>` preview.
 */

import {
    revealApiKeyAction,
    type RevealResult,
} from "@/app/(dashboard)/workspace/[workspaceId]/settings/actions";
import { Button } from "@/components/ui/button";
import { Check, Copy } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";

interface RevealApiKeyCellProps {
    readonly keyId: string;
    readonly workspaceId: string;
    /** False for keys issued before encryption at rest; show rotate hint. */
    readonly revealable: boolean;
    /**
     * Non-secret trailing 6 chars of the plaintext. When present the masked
     * cell shows a Stripe-style suffix; null/absent falls back to all dots.
     */
    readonly last6?: string | null;
}

const MASK = "bsk_••••••••••••••••";

/** Masked preview: Stripe-style `bsk_••••••••••••<last6>`, or all dots when no hint. */
const maskPreview = (last6: string | null | undefined): string =>
    last6 ? `bsk_••••••••••••${last6}` : MASK;

export function RevealApiKeyCell({ keyId, workspaceId, revealable, last6 }: RevealApiKeyCellProps) {
    const [state, formAction, pending] = useActionState<RevealResult | null, FormData>(
        revealApiKeyAction,
        null,
    );
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!state) return;
        if (state.status === "error") {
            toast.error(state.message);
            return;
        }
        if (state.status === "not_recoverable") {
            toast.error("This key predates encrypted storage. Rotate it to enable copy.");
            return;
        }
        // Fetched the plaintext — copy it and never render it. The tab is
        // focused from the click, so the clipboard write is allowed.
        void navigator.clipboard.writeText(state.plaintext).then(
            () => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            },
            () => toast.error("Could not copy to clipboard — check browser permissions."),
        );
    }, [state]);

    if (!revealable) {
        return (
            <span className="text-xs text-muted-foreground">
                not recoverable — rotate to enable copy
            </span>
        );
    }

    return (
        <form action={formAction} className="flex items-center gap-2">
            <input type="hidden" name="workspaceId" value={workspaceId} />
            <input type="hidden" name="keyId" value={keyId} />
            <code className="font-mono text-xs text-muted-foreground">{maskPreview(last6)}</code>
            <Button
                type="submit"
                variant="outline"
                size="sm"
                disabled={pending}
                className="gap-1.5"
            >
                {copied ? (
                    <Check aria-hidden className="size-3.5 text-success" />
                ) : (
                    <Copy aria-hidden className="size-3.5" />
                )}
                {pending ? "Copying…" : copied ? "Copied" : "Copy key"}
            </Button>
        </form>
    );
}
