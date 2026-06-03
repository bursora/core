import { CodeBlock } from "@/components/ui/code-block";
import { CopyButton } from "@/components/ui/copy-button";
import { stripHighlightMarkers } from "@/lib/snippet-highlight";
import { transformerNotationHighlight } from "@shikijs/transformers";

interface SnippetCodeBlockProps {
    /** Snippet source, optionally carrying `// [!code highlight]` markers. */
    readonly code: string;
}

/**
 * Bordered SDK snippet with a floating copy button and highlighted Bursora
 * lines (same notation as the docs). The copied value has the markers stripped.
 * Shared by the setup wizard connect step and the spend empty-state.
 */
export function SnippetCodeBlock({ code }: SnippetCodeBlockProps) {
    return (
        <div className="relative overflow-hidden rounded-[8px] border border-border">
            <div className="absolute right-2 top-2 z-10">
                <CopyButton value={stripHighlightMarkers(code)} />
            </div>
            <CodeBlock code={code} transformers={[transformerNotationHighlight()]} />
        </div>
    );
}
