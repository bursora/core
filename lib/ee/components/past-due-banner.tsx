/**
 * Warning banner for workspaces whose subscription is `past_due`. Fires
 * after a `payment.failed` webhook flips the workspace state. The banner
 * tells the owner what happened and links into the Lemon Squeezy billing
 * portal (via the existing `openPortalAction` server action) so they can
 * update their card.
 *
 * Pure presentational; renders the same way on the server and the client.
 */

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { openPortalAction } from "../billing-actions";

interface PastDueBannerProps {
    readonly workspaceId: string;
}

export function PastDueBanner({ workspaceId }: PastDueBannerProps) {
    return (
        <Alert variant="warning">
            <AlertTitle>Payment failed</AlertTitle>
            <AlertDescription>
                <p>
                    Your last subscription charge did not go through. Update your payment method
                    to keep Bursora cloud features.
                </p>
                <form action={openPortalAction} className="mt-3">
                    <input type="hidden" name="workspaceId" value={workspaceId} />
                    <Button type="submit" variant="secondary" size="sm">
                        Update payment method
                    </Button>
                </form>
            </AlertDescription>
        </Alert>
    );
}
