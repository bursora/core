/**
 * Empty-state for /spend. Shows live SDK quickstart snippets pulled from
 * `sdk/examples/*-quickstart.ts` via `extractRegion`, then renders them with the
 * caller's workspace id and api key plaintext substituted for the sentinel
 * literals — making the snippet copy-paste-ready.
 *
 * The api key plaintext is only available from the issue flash cookie (the SDK
 * authenticates with the plaintext, never the row id). When a key exists but the
 * cookie has expired, the snippet shows a placeholder and a Card points the user
 * to reveal their key; when no key exists at all, a warning prompts them to issue
 * one.
 */

import { readIssuedKey } from "@/app/(dashboard)/workspace/[workspaceId]/settings/issued-key-cookie";
import { renderSnippet } from "@/app/(dashboard)/workspace/[workspaceId]/spend/_lib/quickstart-template";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { SnippetCodeBlock } from "@/components/ui/snippet-code-block";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { DashboardSection } from "@/components/ui/workspace/dashboard-section";
import { ProviderTabList } from "@/components/ui/workspace/provider-tablist";
import { RevealKeyAlert } from "@/components/ui/workspace/reveal-key-alert";
import { env } from "@/lib/env";
import { listApiKeys } from "@/lib/identity/server";
import { BURSORA_API_KEY_PLACEHOLDER } from "@/lib/onboarding/api-key-placeholder";
import { SNIPPET_TEMPLATES, type ProviderSnippet } from "@/lib/onboarding/snippets";
import { buildWorkspacePath, KEYS_FROM_SPEND_EMPTY } from "@/lib/routes";
import { KeyRound } from "lucide-react";
import Link from "next/link";

interface EmptyOnboardingProps {
    readonly workspaceId: string;
}

export async function EmptyOnboarding({ workspaceId }: EmptyOnboardingProps) {
    const first = SNIPPET_TEMPLATES[0];
    if (!first) return null;

    const [allKeys, issued] = await Promise.all([listApiKeys(workspaceId), readIssuedKey()]);
    const liveKey = allKeys
        .filter((k) => k.revokedAt === null)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

    const snippets: ReadonlyArray<ProviderSnippet> = SNIPPET_TEMPLATES.map((t) => ({
        ...t,
        code: renderSnippet(t.code, {
            apiKey: issued ?? BURSORA_API_KEY_PLACEHOLDER,
            workspaceId,
            endpoint: env().NEXT_PUBLIC_APP_URL,
        }),
    }));

    return (
        <div className="flex flex-col gap-4">
            {!liveKey && (
                <Alert variant="warning">
                    <KeyRound aria-hidden />
                    <AlertTitle>Issue an API key to fill in the snippet</AlertTitle>
                    <AlertDescription>
                        <p>
                            The snippet below needs a real API key and your workspace id to send a
                            request.{" "}
                            <Link
                                className="font-medium underline underline-offset-2"
                                href={buildWorkspacePath(workspaceId, "keys", {
                                    from: KEYS_FROM_SPEND_EMPTY,
                                })}
                            >
                                Issue an API key
                            </Link>
                            .
                        </p>
                    </AlertDescription>
                </Alert>
            )}
            {liveKey && !issued && <RevealKeyAlert workspaceId={workspaceId} />}

            <DashboardSection
                label="No usage yet"
                sublabel="install the sdk and send your first request"
            >
                <Tabs defaultValue={first.id}>
                    <ProviderTabList snippets={snippets} />
                    {snippets.map((s) => (
                        <TabsContent key={s.id} value={s.id}>
                            <SnippetCodeBlock code={s.code} />
                        </TabsContent>
                    ))}
                </Tabs>
            </DashboardSection>
        </div>
    );
}
