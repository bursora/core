"use client";

import { dismissIssuedKeyAction } from "@/app/(dashboard)/workspace/[workspaceId]/settings/actions";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Input } from "@/components/ui/input";
import { KeyRoundIcon, TriangleAlertIcon } from "lucide-react";
import { useTransition } from "react";

interface IssuedKeyCardProps {
    /** The plaintext secret. Shown once, never stored — the SDK uses this as BURSORA_API_KEY. */
    plaintext: string;
}

export function IssuedKeyCard({ plaintext }: IssuedKeyCardProps) {
    const [pending, startTransition] = useTransition();

    return (
        <section className="rounded-[8px] border border-warning/40 bg-warning/10 p-5">
            <div className="flex items-start gap-3">
                <TriangleAlertIcon
                    aria-hidden="true"
                    className="mt-0.5 size-5 shrink-0 text-warning"
                />
                <div className="min-w-0 flex-1 space-y-3">
                    <div>
                        <h2 className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-warning">
                            api key issued
                        </h2>
                        <p className="mt-2 text-sm text-foreground">
                            Copy this secret now — it&rsquo;s shown once and never stored. Use it as{" "}
                            <code className="font-mono">BURSORA_API_KEY</code> in your SDK.
                        </p>
                    </div>
                    <div className="space-y-1.5">
                        <label
                            htmlFor="issued-key-plaintext"
                            className="flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground/70"
                        >
                            <KeyRoundIcon aria-hidden="true" className="size-3.5" />
                            Secret API key
                        </label>
                        <div className="flex items-center gap-2">
                            <Input
                                id="issued-key-plaintext"
                                readOnly
                                value={plaintext}
                                onFocus={(e) => e.currentTarget.select()}
                                className="flex-1 font-mono select-all"
                            />
                            <CopyButton value={plaintext} label="Copy" />
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={pending}
                                onClick={() => startTransition(() => dismissIssuedKeyAction())}
                            >
                                I&rsquo;ve saved it
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
