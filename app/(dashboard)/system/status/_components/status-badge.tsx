import { Badge } from "@/components/ui/badge";
import type { ServiceStatus } from "@/lib/system-health";
import { CheckCircle2, type LucideIcon, MinusCircle, XCircle } from "lucide-react";

/** Shared status tone classes — the one source for the emerald/red/muted ramps. */
export const STATUS_TONE = {
    ok: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100",
    down: "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-100",
    muted: "bg-muted text-muted-foreground",
} as const;

const STATUS_META: Record<
    ServiceStatus,
    { label: string; tone: keyof typeof STATUS_TONE; Icon: LucideIcon }
> = {
    ok: { label: "Operational", tone: "ok", Icon: CheckCircle2 },
    down: { label: "Down", tone: "down", Icon: XCircle },
    disabled: { label: "Disabled", tone: "muted", Icon: MinusCircle },
};

interface StatusBadgeProps {
    status: ServiceStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
    const { label, tone, Icon } = STATUS_META[status];
    return (
        <Badge variant="secondary" className={`gap-1 ${STATUS_TONE[tone]}`}>
            <Icon className="size-3.5" />
            {label}
        </Badge>
    );
}
