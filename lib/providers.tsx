import { Server } from "lucide-react";
import type { ReactNode } from "react";
import type { FacetedFilterOption } from "./filter-option";
import {
    AnthropicLogo,
    DeepSeekLogo,
    FireworksLogo,
    GoogleLogo,
    GroqLogo,
    MistralLogo,
    OpenAILogo,
    OpenRouterLogo,
    PerplexityLogo,
    TogetherLogo,
    VercelLogo,
    XaiLogo,
} from "./icons/brand-logos";

/**
 * Canonical provider ids, in display order. The set Bursora detects (SDK
 * baseURL map + native manifests) and prices (LiteLLM sync allowlist). Source
 * of truth for any UI that enumerates providers — e.g. the pricing-override
 * form. Ollama is detected by the SDK but absent here: free local models have
 * no synced price and no spend to cap.
 */
export const PROVIDER_IDS = [
    "openai",
    "anthropic",
    "google",
    "deepseek",
    "groq",
    "xai",
    "mistral",
    "together",
    "fireworks",
    "perplexity",
    "openrouter",
    "vercel",
] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];

const PROVIDER_LABELS: Readonly<Record<string, string>> = {
    openai: "OpenAI",
    anthropic: "Anthropic",
    deepseek: "DeepSeek",
    google: "Google",
    groq: "Groq",
    xai: "xAI",
    mistral: "Mistral",
    together: "Together AI",
    fireworks: "Fireworks AI",
    perplexity: "Perplexity",
    openrouter: "OpenRouter",
    vercel: "Vercel AI Gateway",
    // The Vercel AI SDK is an integration path, not a billed vendor — its events
    // tag the underlying model's provider. It carries a label + icon so it
    // renders as a provider in onboarding and on the landing, but stays out of
    // PROVIDER_IDS (pricing / facets), where it would have nothing to price.
    "ai-sdk": "Vercel AI SDK",
};

export function providerLabel(id: string): string {
    return PROVIDER_LABELS[id] ?? id.charAt(0).toUpperCase() + id.slice(1);
}

const PROVIDER_ICONS: Readonly<
    Record<string, (props: { className?: string | undefined }) => ReactNode>
> = {
    openai: OpenAILogo,
    anthropic: AnthropicLogo,
    deepseek: DeepSeekLogo,
    google: GoogleLogo,
    groq: GroqLogo,
    xai: XaiLogo,
    mistral: MistralLogo,
    together: TogetherLogo,
    fireworks: FireworksLogo,
    perplexity: PerplexityLogo,
    openrouter: OpenRouterLogo,
    vercel: VercelLogo,
    "ai-sdk": VercelLogo,
};

export function ProviderIcon({ id, className }: { id: string; className?: string }): ReactNode {
    const Logo = PROVIDER_ICONS[id];
    if (Logo) return <Logo className={className} />;
    return <Server className={className} aria-hidden />;
}

/**
 * Decorate raw provider options (value + count) with the human label and a
 * brand icon. Pages call this on the provider facet before passing options to
 * `ActiveFilters`; keeps `ActiveFilters` dimension-agnostic.
 */
export function decorateProviderOptions(
    opts: readonly FacetedFilterOption[],
): readonly FacetedFilterOption[] {
    return opts.map((o) => ({
        ...o,
        label: providerLabel(o.value),
        icon: <ProviderIcon id={o.value} className="size-3.5" />,
    }));
}
