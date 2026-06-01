"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { EnvironmentPicker } from "@/components/ui/workspace/environment-picker";
import { cn } from "@/lib/utils";
import { Building2 } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useId, useRef, useState } from "react";

export interface NewWorkspaceState {
    readonly error: string | null;
}

interface Props {
    readonly action: (prev: NewWorkspaceState, formData: FormData) => Promise<NewWorkspaceState>;
    /** Prefilled "{firstName}'s Workspace"; selected on focus so one keystroke replaces it. */
    readonly defaultName: string;
}

const INITIAL: NewWorkspaceState = { error: null };
const MAX_LEN = 60;
const DEFAULT_ENVIRONMENT = "prod";

export function NewWorkspaceForm({ action, defaultName }: Props) {
    const [state, formAction] = useActionState(action, INITIAL);
    const [name, setName] = useState(defaultName);
    const [environment, setEnvironment] = useState<string>(DEFAULT_ENVIRONMENT);
    const errorId = useId();
    const helperId = useId();
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (state.error) inputRef.current?.focus();
    }, [state.error]);

    const trimmed = name.trim();
    const remaining = MAX_LEN - name.length;
    const tooLong = name.length > MAX_LEN;
    const canSubmit = trimmed.length > 0 && !tooLong && environment.trim().length > 0;

    return (
        <form action={formAction} className="flex flex-col gap-5" noValidate>
            <div className="grid gap-2">
                <Label htmlFor="name" className="text-sm font-medium">
                    Workspace name
                </Label>
                <div className="relative">
                    <Building2
                        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                        aria-hidden
                    />
                    <Input
                        ref={inputRef}
                        id="name"
                        name="name"
                        required
                        maxLength={MAX_LEN + 1}
                        autoFocus
                        autoComplete="off"
                        placeholder="Acme Inc."
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onFocus={(e) => e.target.select()}
                        aria-invalid={state.error ? true : undefined}
                        aria-describedby={`${helperId}${state.error ? ` ${errorId}` : ""}`}
                        className="pl-9"
                    />
                </div>
                <div className="flex items-start justify-between gap-3 text-xs">
                    <p id={helperId} className="text-muted-foreground">
                        You can rename this later.
                    </p>
                    <span
                        className={cn(
                            "tabular-nums text-muted-foreground",
                            tooLong && "text-destructive",
                        )}
                        aria-hidden
                    >
                        {remaining}
                    </span>
                </div>
                {state.error ? (
                    <p
                        id={errorId}
                        role="alert"
                        aria-live="polite"
                        className="text-sm text-destructive"
                    >
                        {state.error}
                    </p>
                ) : null}
            </div>

            <div className="grid gap-2">
                <Label className="text-sm font-medium">Environment</Label>
                <EnvironmentPicker value={environment} onChange={setEnvironment} />
                <input type="hidden" name="environment" value={environment} />
                <p className="text-xs text-muted-foreground">
                    A short label like prod, staging, or dev. Shows on the sidebar.
                </p>
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="ghost" asChild>
                    <Link href="/workspace">Cancel</Link>
                </Button>
                <SubmitButton
                    pendingLabel="Creating…"
                    disabled={!canSubmit}
                    className="sm:min-w-40"
                >
                    Create workspace
                </SubmitButton>
            </div>
        </form>
    );
}
