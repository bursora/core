"use client";

import { Button } from "@/components/ui/button";
import { RotateCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function RefreshButton() {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    return (
        <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => startTransition(() => router.refresh())}
        >
            <RotateCw className={pending ? "animate-spin" : ""} />
            Refresh
        </Button>
    );
}
