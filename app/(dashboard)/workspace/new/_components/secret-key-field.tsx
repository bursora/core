"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckIcon, CopyIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface SecretKeyFieldProps {
    /** The plaintext secret to display and copy. */
    readonly value: string;
}

/**
 * Read-only secret value in a single field with the copy control embedded at the
 * trailing edge. The input clips its own overflow, so long keys never spill into
 * a horizontal scrollbar; the user copies via the button rather than reading the
 * value end-to-end. Click selects the whole value; the icon flips to a check on
 * a successful copy.
 */
export function SecretKeyField({ value }: SecretKeyFieldProps) {
    const [copied, setCopied] = useState(false);

    const onCopy = async () => {
        try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch (err: unknown) {
            setCopied(false);
            toast.error("Could not copy — your browser may not allow clipboard access.");
            console.error("SecretKeyField clipboard write failed", err);
        }
    };

    return (
        <div className="relative">
            <Input
                readOnly
                value={value}
                onFocus={(e) => e.currentTarget.select()}
                aria-label="Secret API key"
                className="select-all pr-11 font-mono text-xs"
            />
            <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={onCopy}
                aria-label={copied ? "Copied" : "Copy key"}
                className="absolute right-0.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
                {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
            </Button>
        </div>
    );
}
