/**
 * Empty-state for /spend. Shows live SDK quickstart snippets pulled from
 * `sdk/examples/*-quickstart.ts` via `extractRegion`, then renders them with the
 * caller's workspace id and most-recent non-revoked api key id substituted
 * for the sentinel literals — making the snippet copy-paste-ready.
 *
 * If the workspace has no api key yet, the snippets keep the placeholder
 * text and a warning-tinted Card prompts the user to issue one.
 */

import { renderSnippet } from "@/app/(dashboard)/workspace/[workspaceId]/spend/_lib/quickstart-template";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CodeBlock } from "@/components/ui/code-block";
import { CopyButton } from "@/components/ui/copy-button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DashboardSection } from "@/components/ui/workspace/dashboard-section";
import { env } from "@/lib/env";
import { listApiKeys } from "@/lib/identity/server";
import { SNIPPET_TEMPLATES, type ProviderSnippet } from "@/lib/onboarding/snippets";
import { ProviderIcon } from "@/lib/providers";
import { buildWorkspacePath, KEYS_FROM_SPEND_EMPTY } from "@/lib/routes";
import { KeyRound } from "lucide-react";
import Link from "next/link";

interface EmptyOnboardingProps {
    readonly workspaceId: string;
}

export async function EmptyOnboarding({ workspaceId }: EmptyOnboardingProps) {
    const first = SNIPPET_TEMPLATES[0];
    if (!first) return null;

    const allKeys = await listApiKeys(workspaceId);
    const liveKey = allKeys
        .filter((k) => k.revokedAt === null)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

    const snippets: ReadonlyArray<ProviderSnippet> = liveKey
        ? SNIPPET_TEMPLATES.map((t) => ({
              ...t,
              code: renderSnippet(t.code, {
                  apiKey: liveKey.id,
                  workspaceId,
                  endpoint: env().NEXT_PUBLIC_APP_URL,
              }),
          }))
        : SNIPPET_TEMPLATES;

    return (
        <div className="flex flex-col gap-4">
            {!liveKey && (
                <Alert variant="warning">
                    <KeyRound aria-hidden />
                    <AlertTitle>Issue an API key to fill in the snippet</AlertTitle>
                    <AlertDescription>
                        <p>
                            The placeholders below need a real key id and your workspace id to send
                            a request.{" "}
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

            <DashboardSection
                label="No usage yet"
                sublabel="install the sdk and send your first request"
            >
                <Tabs defaultValue={first.id}>
                    <TabsList className="flex-wrap justify-start group-data-[orientation=horizontal]/tabs:h-auto">
                        {snippets.map((s) => (
                            <TabsTrigger key={s.id} value={s.id} className="flex-none">
                                <ProviderIcon id={s.id} className="size-4" />
                                {s.label}
                            </TabsTrigger>
                        ))}
                    </TabsList>
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
            </DashboardSection>
        </div>
    );
}
