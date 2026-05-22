import type { ReactNode } from "react";

export interface FacetedFilterOption {
    readonly value: string;
    readonly count: number;
    readonly label?: string;
    readonly icon?: ReactNode;
}
