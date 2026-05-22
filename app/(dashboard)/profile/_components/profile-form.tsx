"use client";

import { updateProfileAction } from "@/app/(dashboard)/profile/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type ActionResult } from "@/lib/action-result";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";

const MAX_LENGTH = 60;

interface ProfileFormProps {
    readonly currentName: string;
}

export function ProfileForm({ currentName }: ProfileFormProps) {
    const router = useRouter();
    const [state, formAction, pending] = useActionState<ActionResult, FormData>(
        updateProfileAction,
        { ok: false },
    );
    const [name, setName] = useState(currentName);

    useEffect(() => {
        if (state.ok) {
            toast.success("Profile updated.");
            router.refresh();
        } else if (state.error) {
            toast.error(state.error);
        }
    }, [state, router]);

    const dirty = name.trim().length > 0 && name.trim() !== currentName;

    return (
        <form action={formAction} className="space-y-3">
            <div className="space-y-2">
                <Label htmlFor="profile-name">Name</Label>
                <Input
                    id="profile-name"
                    name="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    maxLength={MAX_LENGTH}
                    minLength={1}
                    aria-invalid={state.fieldErrors?.name ? true : undefined}
                />
                {state.fieldErrors?.name ? (
                    <p className="text-xs text-destructive">{state.fieldErrors.name}</p>
                ) : null}
            </div>
            <Button type="submit" disabled={pending || !dirty}>
                {pending ? "Saving…" : "Save"}
            </Button>
        </form>
    );
}
