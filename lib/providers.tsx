import { Server } from "lucide-react";
import type { ReactNode } from "react";
import type { FacetedFilterOption } from "./filter-option";
import { AnthropicLogo, DeepSeekLogo, OpenAILogo } from "./icons/brand-logos";

const PROVIDER_LABELS: Readonly<Record<string, string>> = {
    openai: "OpenAI",
    anthropic: "Anthropic",
    deepseek: "DeepSeek",
    google: "Google",
    azure: "Azure OpenAI",
};

export function providerLabel(id: string): string {
    return PROVIDER_LABELS[id] ?? id.charAt(0).toUpperCase() + id.slice(1);
}

export function ProviderIcon({ id, className }: { id: string; className?: string }): ReactNode {
    if (id === "openai") return <OpenAILogo className={className} />;
    if (id === "anthropic") return <AnthropicLogo className={className} />;
    if (id === "deepseek") return <DeepSeekLogo className={className} />;
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
