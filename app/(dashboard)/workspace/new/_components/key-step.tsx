/**
 * Step ② of the setup wizard. The first API key was issued by the step ①
 * action and its plaintext flashed via the issued-key cookie; show it inline
 * here for convenience (mono header + inline copy, value selectable on click).
 * The key is stored encrypted, so it can also be revealed and copied any time
 * from API keys. Continue clears the flash and advances to connect.
 *
 * If the secret has already been consumed (back-nav after continuing) but a live
 * key exists, show a quiet confirmation instead. With no live key at all, point
 * the user at the keys page rather than advancing into a broken snippet.
 */

import { continueToConnectAction } from "@/app/(dashboard)/workspace/new/actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { buildWorkspacePath } from "@/lib/routes";
import { Check, KeyRound } from "lucide-react";
import Link from "next/link";

interface KeyStepProps {
    readonly workspaceId: string;
    readonly plaintext: string | null;
    readonly hasLiveKey: boolean;
}

export function KeyStep({ workspaceId, plaintext, hasLiveKey }: KeyStepProps) {
    if (!plaintext && !hasLiveKey) {
        return (
            <div className="space-y-5">
                <Alert variant="warning">
                    <KeyRound aria-hidden />
                    <AlertTitle>No API key yet</AlertTitle>
                    <AlertDescription>Issue one to connect your app.</AlertDescription>
                </Alert>
                <Button asChild>
                    <Link href={buildWorkspacePath(workspaceId, "keys")}>Go to API keys</Link>
                </Button>
            </div>
        );
    }

    return (
        <div className="space-y-5">
            {plaintext ? (
                <div className="space-y-2.5">
                    <div className="overflow-hidden rounded-[8px] border border-border bg-muted/30">
                        <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
                            <span className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground/70">
                                Secret key
                            </span>
                            <CopyButton value={plaintext} label="Copy key" />
                        </div>
                        <div className="select-all overflow-x-auto whitespace-nowrap px-3 py-2.5 font-mono text-[11px] leading-relaxed">
                            {plaintext}
                        </div>
                    </div>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                        Set it as <code className="font-mono">BURSORA_API_KEY</code> where your app
                        runs. The SDK sends it with every budget check and usage report, so keep it
                        server-side. You can reveal and copy it again any time from API keys.
                    </p>
                </div>
            ) : (
                <Alert variant="success">
                    <Check aria-hidden />
                    <AlertTitle>Your API key is ready.</AlertTitle>
                </Alert>
            )}

            <form action={continueToConnectAction}>
                <input type="hidden" name="ws" value={workspaceId} />
                <Button type="submit" autoFocus className="sm:min-w-40">
                    Continue
                </Button>
            </form>
        </div>
    );
}
