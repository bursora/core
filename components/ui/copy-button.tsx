"use client";

import { Button } from "./button";
import { CheckIcon, CopyIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface CopyButtonProps {
    value: string;
    label?: string;
}

export function CopyButton({ value, label = "Copy" }: CopyButtonProps) {
    const [copied, setCopied] = useState(false);

    const onCopy = async () => {
        try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch (err: unknown) {
            setCopied(false);
            toast.error("Could not copy — your browser may not allow clipboard access.");
            console.error("CopyButton clipboard write failed", err);
        }
    };

    return (
        <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onCopy}
            aria-label={label}
            className="gap-1.5"
        >
            {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
            {copied ? "Copied" : label}
        </Button>
    );
}
