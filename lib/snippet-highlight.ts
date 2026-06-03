/**
 * A trailing `// [!code highlight]` marker in a snippet is turned into a
 * highlighted line by `transformerNotationHighlight`. The stripper removes it so
 * a copied snippet never carries the notation. Shared by every surface that
 * copies a marked snippet (docs, the setup wizard, the spend empty-state).
 */

/** Remove `// [!code highlight]` / `# [!code highlight]` markers from copy text. */
export function stripHighlightMarkers(code: string): string {
    return code.replace(/\s*(?:\/\/|#)\s*\[!code\s+highlight\]\s*$/gm, "");
}
