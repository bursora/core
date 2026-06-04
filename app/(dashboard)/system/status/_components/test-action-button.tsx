"use client";

import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { type ReactNode, useTransition } from "react";
import { toast } from "sonner";
import type { TestActionResult } from "../actions";

interface TestActionButtonProps {
    label: string;
    icon: ReactNode;
    action: () => Promise<TestActionResult>;
    /** Toast text when the action succeeds without its own detail message. */
    successFallback: string;
}

/** Fires an admin server action (test email / test Sentry event) and toasts the result. */
export function TestActionButton({ label, icon, action, successFallback }: TestActionButtonProps) {
    const [pending, startTransition] = useTransition();
    return (
        <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() =>
                startTransition(async () => {
                    const result = await action();
                    if (result.ok) toast.success(result.detail ?? successFallback);
                    else toast.error(result.error);
                })
            }
        >
            {pending ? <Loader2 className="animate-spin" /> : icon}
            {label}
        </Button>
    );
}
