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
import { extractRegion } from "@/lib/extract-snippet";
import { listApiKeys } from "@/lib/identity/server";
import { buildWorkspacePath } from "@/lib/routes";
import { KeyRound } from "lucide-react";
import Link from "next/link";
import path from "node:path";

interface ProviderSnippet {
    readonly id: string;
    readonly label: string;
    readonly code: string;
}

const ROOT = path.join(process.cwd(), "..");
const PROVIDERS: ReadonlyArray<{
    id: string;
    label: string;
    file: string;
    region: string;
}> = [
    {
        id: "openai",
        label: "OpenAI",
        file: "sdk/examples/openai-quickstart.ts",
        region: "openai-quickstart",
    },
    {
        id: "anthropic",
        label: "Anthropic",
        file: "sdk/examples/anthropic-quickstart.ts",
        region: "anthropic-quickstart",
    },
    {
        id: "openai-embeddings",
        label: "OpenAI Embeddings",
        file: "sdk/examples/openai-embeddings-quickstart.ts",
        region: "openai-embeddings-quickstart",
    },
    {
        id: "deepseek",
        label: "DeepSeek",
        file: "sdk/examples/deepseek-quickstart.ts",
        region: "deepseek-quickstart",
    },
];

const TEMPLATES: ReadonlyArray<ProviderSnippet> = PROVIDERS.map((p) => ({
    id: p.id,
    label: p.label,
    code: extractRegion(path.join(ROOT, p.file), p.region),
}));

interface EmptyOnboardingProps {
    readonly workspaceId: string;
}

export async function EmptyOnboarding({ workspaceId }: EmptyOnboardingProps) {
    const first = TEMPLATES[0];
    if (!first) return null;

    const allKeys = await listApiKeys(workspaceId);
    const liveKey = allKeys
        .filter((k) => k.revokedAt === null)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

    const snippets: ReadonlyArray<ProviderSnippet> = liveKey
        ? TEMPLATES.map((t) => ({
              ...t,
              code: renderSnippet(t.code, {
                  apiKey: liveKey.id,
                  workspaceId,
                  endpoint: env().NEXT_PUBLIC_APP_URL,
              }),
          }))
        : TEMPLATES;

    return (
        <div className="flex flex-col gap-4">
            {!liveKey && (
                <Alert variant="warning">
                    <KeyRound aria-hidden />
                    <AlertTitle>Issue an API key to fill in the snippet</AlertTitle>
                    <AlertDescription>
                        The placeholders below need a real key id and your workspace id to send a
                        request.{" "}
                        <Link
                            className="font-medium underline underline-offset-2"
                            href={buildWorkspacePath(workspaceId, "keys", {
                                from: "spend-empty",
                            })}
                        >
                            Issue an API key
                        </Link>
                        .
                    </AlertDescription>
                </Alert>
            )}

            <DashboardSection
                label="No usage yet"
                sublabel="install the sdk and send your first request"
            >
                <Tabs defaultValue={first.id}>
                    <TabsList>
                        {snippets.map((s) => (
                            <TabsTrigger key={s.id} value={s.id}>
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
