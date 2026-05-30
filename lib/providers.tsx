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
    XaiLogo,
} from "./icons/brand-logos";

const PROVIDER_LABELS: Readonly<Record<string, string>> = {
    openai: "OpenAI",
    anthropic: "Anthropic",
    deepseek: "DeepSeek",
    google: "Google",
    azure: "Azure OpenAI",
    groq: "Groq",
    xai: "xAI",
    mistral: "Mistral",
    together: "Together AI",
    fireworks: "Fireworks AI",
    perplexity: "Perplexity",
    openrouter: "OpenRouter",
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
