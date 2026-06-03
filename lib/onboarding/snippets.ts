/**
 * Shared SDK quickstart snippets for the onboarding empty-state and the setup
 * wizard. The ordered provider list lives here; both surfaces import
 * `SNIPPET_TEMPLATES` and render each with `renderSnippet`, filling in the
 * workspace id and a live api key id.
 *
 * Two snippet sources, split by shape:
 *  - Distinct-shape integrations — the native OpenAI, Anthropic, and Google
 *    clients, plus the Vercel AI SDK middleware — are read verbatim from the
 *    runnable `sdk/examples/*-quickstart.ts` files via `extractRegion`, so each
 *    rendered snippet stays in lockstep with a type-checked example.
 *  - The OpenAI-compatible vendors (DeepSeek, Groq, xAI, Mistral, Together,
 *    Fireworks, Perplexity, OpenRouter, Vercel AI Gateway) are one uniform
 *    `new OpenAI({ baseURL })` shape, so they are generated from `COMPAT_TEMPLATE`
 *    plus a per-vendor row rather than nine near-identical example files.
 *
 * Order mirrors the canonical provider list (see `@/lib/providers`), with the
 * Vercel AI SDK tab last.
 */

import { extractRegion } from "@/lib/extract-snippet";
import { providerLabel, type ProviderId } from "@/lib/providers";
import path from "node:path";

export interface ProviderSnippet {
    readonly id: string;
    readonly label: string;
    readonly code: string;
}

const ROOT = path.join(process.cwd(), "..");

/** Add the `// [!code highlight]` marker to the `@bursora/sdk` import and the wrap
 *  statement (from `= wrap(` to its closing line) so the rendered snippet
 *  emphasizes the lines a user adds to integrate Bursora. */
function markBursoraLines(code: string): string {
    let inWrap = false;
    return code
        .split("\n")
        .map((line) => {
            if (/=\s*wrap(?:LanguageModel)?\(/.test(line)) inWrap = true;
            const mark = inWrap || line.includes("@bursora/sdk");
            if (inWrap && /^[)}]/.test(line)) inWrap = false;
            return mark ? `${line} // [!code highlight]` : line;
        })
        .join("\n");
}

/** A distinct-shape snippet read from its runnable example file. File basename
 *  equals the region id (e.g. `openai-quickstart.ts` ↔ `openai-quickstart`). */
function extracted(id: string, label: string, region: string): ProviderSnippet {
    return {
        id,
        label,
        code: markBursoraLines(
            extractRegion(path.join(ROOT, "sdk", "examples", `${region}.ts`), region),
        ),
    };
}

const COMPAT_TEMPLATE = `import { wrap } from "@bursora/sdk";
import OpenAI from "openai";

// Workspace: "__BURSORA_WORKSPACE_ID__"
// {{label}} is OpenAI-compatible: reuse the \`openai\` package and point baseURL
// at {{host}}. Bursora reads the override and tags events provider: "{{id}}".
const {{var}} = wrap(
    new OpenAI({
        apiKey: process.env.{{env}},
        baseURL: "{{baseURL}}",
    }),
    {
        apiKey: "__BURSORA_API_KEY__",
        endpoint: "__BURSORA_ENDPOINT__",
    },
);

await {{var}}.chat.completions.create({
    model: "{{model}}",
    messages: [{ role: "user", content: "Say hi" }],
});`;

interface CompatVendor {
    readonly id: ProviderId;
    readonly env: string;
    readonly baseURL: string;
    readonly host: string;
    readonly model: string;
}

// Each host substring matches the SDK's baseURL → vendor map
// (`sdk/src/internal/provider-from-base-url.ts`), so a wrapped client points at
// the real endpoint and events tag with the right vendor slug.
const COMPAT_VENDORS: readonly CompatVendor[] = [
    {
        id: "deepseek",
        env: "DEEPSEEK_API_KEY",
        baseURL: "https://api.deepseek.com",
        host: "api.deepseek.com",
        model: "deepseek-chat",
    },
    {
        id: "groq",
        env: "GROQ_API_KEY",
        baseURL: "https://api.groq.com/openai/v1",
        host: "api.groq.com",
        model: "llama-3.3-70b-versatile",
    },
    {
        id: "xai",
        env: "XAI_API_KEY",
        baseURL: "https://api.x.ai/v1",
        host: "api.x.ai",
        model: "grok-2-latest",
    },
    {
        id: "mistral",
        env: "MISTRAL_API_KEY",
        baseURL: "https://api.mistral.ai/v1",
        host: "api.mistral.ai",
        model: "mistral-large-latest",
    },
    {
        id: "together",
        env: "TOGETHER_API_KEY",
        baseURL: "https://api.together.xyz/v1",
        host: "api.together.xyz",
        model: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    },
    {
        id: "fireworks",
        env: "FIREWORKS_API_KEY",
        baseURL: "https://api.fireworks.ai/inference/v1",
        host: "api.fireworks.ai",
        model: "accounts/fireworks/models/llama-v3p3-70b-instruct",
    },
    {
        id: "perplexity",
        env: "PERPLEXITY_API_KEY",
        baseURL: "https://api.perplexity.ai",
        host: "api.perplexity.ai",
        model: "sonar",
    },
    {
        id: "openrouter",
        env: "OPENROUTER_API_KEY",
        baseURL: "https://openrouter.ai/api/v1",
        host: "openrouter.ai",
        model: "openai/gpt-4o-mini",
    },
    {
        id: "vercel",
        env: "AI_GATEWAY_API_KEY",
        baseURL: "https://ai-gateway.vercel.sh/v1",
        host: "ai-gateway.vercel.sh",
        model: "openai/gpt-4o",
    },
];

function compatSnippet(v: CompatVendor): ProviderSnippet {
    const label = providerLabel(v.id);
    const code = COMPAT_TEMPLATE.replaceAll("{{label}}", label)
        .replaceAll("{{host}}", v.host)
        .replaceAll("{{id}}", v.id)
        .replaceAll("{{var}}", v.id)
        .replaceAll("{{env}}", v.env)
        .replaceAll("{{baseURL}}", v.baseURL)
        .replaceAll("{{model}}", v.model);
    return { id: v.id, label, code: markBursoraLines(code) };
}

export const SNIPPET_TEMPLATES: ReadonlyArray<ProviderSnippet> = [
    extracted("openai", providerLabel("openai"), "openai-quickstart"),
    extracted("anthropic", providerLabel("anthropic"), "anthropic-quickstart"),
    extracted("google", providerLabel("google"), "google-quickstart"),
    ...COMPAT_VENDORS.map(compatSnippet),
    extracted("ai-sdk", providerLabel("ai-sdk"), "ai-sdk-quickstart"),
];
