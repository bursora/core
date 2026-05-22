import { Badge } from "@/components/ui/badge";
import { Check } from "lucide-react";

interface VerificationBadgeProps {
    readonly verified: boolean;
}

export function VerificationBadge({ verified }: VerificationBadgeProps) {
    return (
        <Badge
            variant="secondary"
            className={
                verified
                    ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100"
                    : "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100"
            }
        >
            {verified ? <Check /> : null}
            {verified ? "Verified" : "Unverified"}
        </Badge>
    );
}
