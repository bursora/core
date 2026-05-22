export interface Window {
    readonly from: Date;
    readonly to: Date;
}

export function priorWindow(from: Date, to: Date): Window {
    const span = to.getTime() - from.getTime();
    return { from: new Date(from.getTime() - span), to: from };
}

export function relativeDelta(current: number, prior: number): number | null {
    if (!Number.isFinite(current) || !Number.isFinite(prior)) return null;
    if (prior === 0) {
        if (current === 0) return 0;
        return current > 0 ? 1 : -1;
    }
    return (current - prior) / prior;
}
