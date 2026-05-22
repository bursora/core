/**
 * Pure helpers for the Add-filter / chip-row flow.
 *
 * `computeVisibleDimensions` — which dimensions render as chips: any with a
 * URL value plus the one the user just promoted from the palette (held in
 * transient client state until it gains a value or the popover closes).
 *
 * `computeAddableDimensions` — what the palette lists: dimensions not yet
 * visible, in registry order.
 */

export function computeVisibleDimensions<K extends string>(
    allDimensions: readonly K[],
    isActive: (dim: K) => boolean,
    justAdded: K | null,
): readonly K[] {
    return allDimensions.filter((d) => isActive(d) || d === justAdded);
}

export function computeAddableDimensions<K extends string>(
    allDimensions: readonly K[],
    visible: readonly K[],
): readonly K[] {
    const visibleSet = new Set(visible);
    return allDimensions.filter((d) => !visibleSet.has(d));
}
