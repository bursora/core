/**
 * Model display helpers.
 *
 * Provider is resolved from the `pricing` table (see `models-server.ts`) —
 * never inferred from the slug. This file owns only pure label formatting
 * and JSX that takes provider as an input.
 */

import type { FacetedFilterOption } from "./filter-option";
import { ProviderIcon, providerLabel } from "./providers";
import { cn } from "./utils";

const ACRONYMS: ReadonlySet<string> = new Set(["gpt", "o1", "o3", "o4"]);

export function displayModel(slug: string): string {
    const stripped = slug.replace(/-\d{8}$/, "").replace(/-latest$/i, "");
    const tokens = mergeNumericTokens(stripped.split("-"));
    return tokens.map(prettyToken).join(" ");
}

// Adjacent numeric tokens become a dotted version: ["3", "5"] → ["3.5"].
function mergeNumericTokens(tokens: readonly string[]): string[] {
    const out: string[] = [];
    for (const t of tokens) {
        const last = out[out.length - 1];
        if (/^\d+$/.test(t) && last !== undefined && /\d$/.test(last)) {
            out[out.length - 1] = `${last}.${t}`;
        } else {
            out.push(t);
        }
    }
    return out;
}

function prettyToken(token: string): string {
    const lower = token.toLowerCase();
    if (ACRONYMS.has(lower)) return lower.toUpperCase();
    if (lower === "deepseek") return "DeepSeek";
    if (/^\d/.test(token)) return token;
    return lower.charAt(0).toUpperCase() + lower.slice(1);
}

interface ModelTagProps {
    readonly slug: string;
    /** Provider id resolved from the pricing table. Falls back to `"unknown"`
     *  (renders a generic server glyph and "Unknown") when the slug isn't in
     *  pricing yet. */
    readonly provider: string;
    readonly className?: string;
}

/** Inline: `[Logo] Label · Provider`. Single-line, fits in dense table cells. */
export function ModelTag({ slug, provider, className }: ModelTagProps) {
    return (
        <span className={cn("inline-flex items-center gap-2", className)}>
            <ProviderIcon id={provider} className="size-4 shrink-0" />
            <span className="text-sm font-medium text-foreground">{displayModel(slug)}</span>
            <span className="text-xs text-muted-foreground">{providerLabel(provider)}</span>
        </span>
    );
}

/** Decorate model facet options with human label + provider icon. Caller
 *  passes the slug→provider map resolved from pricing. */
export function decorateModelOptions(
    opts: readonly FacetedFilterOption[],
    providers: Readonly<Record<string, string>>,
): readonly FacetedFilterOption[] {
    return opts.map((o) => ({
        ...o,
        label: displayModel(o.value),
        icon: <ProviderIcon id={providers[o.value] ?? "unknown"} className="size-3.5" />,
    }));
}
