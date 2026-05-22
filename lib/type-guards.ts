/**
 * Reusable type guards for narrowing untrusted input (search params, form
 * fields) to a known literal union.
 *
 * Example:
 *   const isFacet = oneOf(["tenant", "agent", "workflow", "model"] as const);
 *   if (isFacet(search.facet)) // search.facet is now the literal type
 */

export const oneOf =
    <T extends string>(values: readonly T[]) =>
    (s: string | undefined): s is T =>
        s !== undefined && (values as readonly string[]).includes(s);
