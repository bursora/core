/**
 * Narrow the first row of a drizzle `.returning()` result, throwing a
 * consistent error when an insert yields nothing. Centralizes the
 * "<entity> insert returned no row" guard repeated across repositories.
 */
export function requireInsertedRow<T>(row: T | undefined, entity: string): T {
    if (!row) throw new Error(`${entity} insert returned no row`);
    return row;
}
