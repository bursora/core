/**
 * Shown on the onboarding connect step and the /spend empty-state when the
 * snippet falls back to the placeholder because the issue flash cookie has
 * expired. Points the user to reveal their key on the Keys page.
 */

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { BURSORA_API_KEY_PLACEHOLDER } from "@/lib/onboarding/api-key-placeholder";
import { buildWorkspacePath } from "@/lib/routes";
import { KeyRound } from "lucide-react";
import Link from "next/link";

interface RevealKeyAlertProps {
    readonly workspaceId: string;
}

export function RevealKeyAlert({ workspaceId }: RevealKeyAlertProps) {
    return (
        <Alert variant="warning">
            <KeyRound aria-hidden />
            <AlertTitle>Add your API key to the snippet</AlertTitle>
            <AlertDescription>
                <p>
                    Replace {BURSORA_API_KEY_PLACEHOLDER} with the key shown when you created it.
                    Lost it?{" "}
                    <Link
                        className="font-medium underline underline-offset-2"
                        href={buildWorkspacePath(workspaceId, "keys")}
                    >
                        Reveal it on the Keys page
                    </Link>
                    .
                </p>
            </AlertDescription>
        </Alert>
    );
}
