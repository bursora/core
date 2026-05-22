/**
 * Pure axis geometry for the dashboard Runway timeline.
 *
 * Maps absolute tick dates onto a normalized `[0, 1]` position along a
 * horizontal axis defined by `start` and `end`. Out-of-range ticks clamp to
 * the nearer edge and carry `outOfRange: true`. Labels that fall within
 * `CLOSE_RATIO` of each other alternate stack depths so they don't overlap
 * when rendered below the axis.
 *
 * No clock reads, no DOM, no IO. The caller resolves dates upstream and feeds
 * everything in. Returned tick array is sorted ascending by position.
 */

export type TickTone = "destructive" | "warning" | "muted";

export interface TickInput {
    readonly id: string;
    readonly label: string;
    readonly date: Date;
    readonly tone: TickTone;
}

export interface AxisTick {
    readonly id: string;
    readonly label: string;
    readonly date: Date;
    readonly tone: TickTone;
    /** Normalized position along the axis in `[0, 1]`. */
    readonly position: number;
    /** True when the original date fell outside `[start, end]` and was clamped. */
    readonly outOfRange: boolean;
    /** Vertical label slot: `0` is closest to axis; `1` is one row below. */
    readonly stackDepth: number;
}

export interface AxisGeometry {
    readonly start: Date;
    readonly end: Date;
    readonly ticks: readonly AxisTick[];
}

/** Threshold (as a ratio of axis width) below which two adjacent ticks stack. */
const CLOSE_RATIO = 0.1;

export interface AxisGeometryInput {
    readonly start: Date;
    readonly end: Date;
    readonly ticks: readonly TickInput[];
}

export function computeAxisGeometry(input: AxisGeometryInput): AxisGeometry {
    const span = input.end.getTime() - input.start.getTime();
    const positioned = input.ticks.map((t) => positionTick(t, input.start, span));
    const sorted = [...positioned].sort((a, b) => a.position - b.position);
    const stacked = applyStackDepths(sorted);
    return { start: input.start, end: input.end, ticks: stacked };
}

interface PositionedTick {
    readonly input: TickInput;
    readonly position: number;
    readonly outOfRange: boolean;
}

function positionTick(t: TickInput, start: Date, span: number): PositionedTick {
    if (span <= 0) {
        return { input: t, position: 0, outOfRange: true };
    }
    const raw = (t.date.getTime() - start.getTime()) / span;
    if (raw < 0) return { input: t, position: 0, outOfRange: true };
    if (raw > 1) return { input: t, position: 1, outOfRange: true };
    return { input: t, position: raw, outOfRange: false };
}

function applyStackDepths(sorted: readonly PositionedTick[]): readonly AxisTick[] {
    const out: AxisTick[] = [];
    let lastPosition = Number.NEGATIVE_INFINITY;
    let lastDepth = 0;
    for (const p of sorted) {
        // While ticks stay within CLOSE_RATIO of the previous one, walk depth
        // upward so labels stagger instead of stacking on top of each other.
        // The first tick (lastPosition = -Infinity) always starts at depth 0.
        const close = p.position - lastPosition < CLOSE_RATIO;
        const depth = close ? lastDepth + 1 : 0;
        out.push({
            id: p.input.id,
            label: p.input.label,
            date: p.input.date,
            tone: p.input.tone,
            position: p.position,
            outOfRange: p.outOfRange,
            stackDepth: depth,
        });
        lastPosition = p.position;
        lastDepth = depth;
    }
    return out;
}
