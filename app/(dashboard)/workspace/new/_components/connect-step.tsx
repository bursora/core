/**
 * Step ③ of the setup wizard. Shows the multi-provider wrap-client snippet
 * prefilled with the workspace id and the live api key plaintext (mirrors the
 * spend empty-state), plus the live "listening for your first call" panel.
 * Finish is always enabled and lands on the dashboard home.
 *
 * The SDK authenticates with the key plaintext, never the row id. The plaintext
 * comes from the issue flash cookie set one step earlier; if it has expired, the
 * snippet shows a placeholder and points the user to reveal their key.
 */

import { renderSnippet } from "@/app/(dashboard)/workspace/[workspaceId]/spend/_lib/quickstart-template";
import { Button } from "@/components/ui/button";
import { FirstEventPanel } from "@/components/ui/first-event-poll";
import { SnippetCodeBlock } from "@/components/ui/snippet-code-block";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { ProviderTabList } from "@/components/ui/workspace/provider-tablist";
import { RevealKeyAlert } from "@/components/ui/workspace/reveal-key-alert";
import { env } from "@/lib/env";
import { BURSORA_API_KEY_PLACEHOLDER } from "@/lib/onboarding/api-key-placeholder";
import { SNIPPET_TEMPLATES, type ProviderSnippet } from "@/lib/onboarding/snippets";
import { buildWorkspacePath } from "@/lib/routes";
import Link from "next/link";

interface ConnectStepProps {
    readonly workspaceId: string;
    /** Freshly issued key plaintext from the flash cookie; null once it expires. */
    readonly issuedPlaintext: string | null;
}

export function ConnectStep({ workspaceId, issuedPlaintext }: ConnectStepProps) {
    const first = SNIPPET_TEMPLATES[0];
    if (!first) return null;

    const snippets: ReadonlyArray<ProviderSnippet> = SNIPPET_TEMPLATES.map((t) => ({
        ...t,
        code: renderSnippet(t.code, {
            apiKey: issuedPlaintext ?? BURSORA_API_KEY_PLACEHOLDER,
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

            {!issuedPlaintext && <RevealKeyAlert workspaceId={workspaceId} />}

            <Tabs defaultValue={first.id}>
                <ProviderTabList snippets={snippets} />
                {snippets.map((s) => (
                    <TabsContent key={s.id} value={s.id}>
                        <SnippetCodeBlock code={s.code} />
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
