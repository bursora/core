/**
 * Money-back guarantee panel. Shown only while the workspace is inside
 * `refund_eligible_until`. Refunds are handled by support: the panel points
 * the user at the refund email. Support issues the refund from the Lemon
 * Squeezy dashboard and the `order.refunded` webhook reconciles the workspace
 * state.
 */

import { DashboardSection } from "@/components/ui/workspace/dashboard-section";
import { StatusTag } from "@/components/ui/workspace/status-tag";

interface RefundPanelProps {
    readonly eligibleUntil: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const REFUND_EMAIL = "hello@bursora.com";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
});

export function RefundPanel({ eligibleUntil }: RefundPanelProps) {
    const daysRemaining = Math.max(
        0,
        // eslint-disable-next-line react-hooks/purity -- server-rendered once per request; current time is the countdown basis
        Math.ceil((eligibleUntil.getTime() - Date.now()) / DAY_MS),
    );

    return (
        <DashboardSection label="Money-back guarantee">
            <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm text-foreground">
                    Full refund available through {dateFormatter.format(eligibleUntil)}.
                </p>
                <StatusTag tone="success" variant="pill">
                    {daysRemaining === 1 ? "1 day left" : `${daysRemaining} days left`}
                </StatusTag>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
                Changed your mind? Email{" "}
                <a
                    href={`mailto:${REFUND_EMAIL}?subject=Refund%20request`}
                    className="font-medium text-foreground underline underline-offset-4 hover:text-primary"
                >
                    {REFUND_EMAIL}
                </a>{" "}
                and we&apos;ll refund every paid invoice and cancel your subscription. No questions
                asked.
            </p>
        </DashboardSection>
    );
}
