/**
 * Step ③ of the setup wizard. Shows the multi-provider wrap-client snippet
 * prefilled with the workspace id and the live key id (mirrors the spend
 * empty-state), plus the live "listening for your first call" panel. Finish is
 * always enabled and lands on the dashboard home.
 */

import { renderSnippet } from "@/app/(dashboard)/workspace/[workspaceId]/spend/_lib/quickstart-template";
import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/ui/code-block";
import { CopyButton } from "@/components/ui/copy-button";
import { FirstEventPanel } from "@/components/ui/first-event-poll";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { ProviderTabList } from "@/components/ui/workspace/provider-tablist";
import { env } from "@/lib/env";
import { SNIPPET_TEMPLATES, type ProviderSnippet } from "@/lib/onboarding/snippets";
import { buildWorkspacePath } from "@/lib/routes";
import Link from "next/link";

interface ConnectStepProps {
    readonly workspaceId: string;
    readonly apiKeyId: string;
}

export function ConnectStep({ workspaceId, apiKeyId }: ConnectStepProps) {
    const first = SNIPPET_TEMPLATES[0];
    if (!first) return null;

    const snippets: ReadonlyArray<ProviderSnippet> = SNIPPET_TEMPLATES.map((t) => ({
        ...t,
        code: renderSnippet(t.code, {
            apiKey: apiKeyId,
            workspaceId,
            endpoint: env().NEXT_PUBLIC_APP_URL,
        }),
    }));

    return (
        <div className="space-y-5">
            <p className="text-sm text-muted-foreground">
                Wrap your AI client once. The SDK checks the budget before each call and reports
                what it spent.
            </p>

            <Tabs defaultValue={first.id}>
                <ProviderTabList snippets={snippets} />
                {snippets.map((s) => (
                    <TabsContent key={s.id} value={s.id}>
                        <div className="relative overflow-hidden rounded-[8px] border border-border">
                            <div className="absolute right-2 top-2 z-10">
                                <CopyButton value={s.code} />
                            </div>
                            <CodeBlock code={s.code} className="[&_pre]:pr-24" />
                        </div>
                    </TabsContent>
                ))}
            </Tabs>

            <FirstEventPanel workspaceId={workspaceId} />

            <div className="flex justify-end">
                <Button asChild className="sm:min-w-40">
                    <Link href={buildWorkspacePath(workspaceId)}>Finish</Link>
                </Button>
            </div>
        </div>
    );
}
