import type { SVGProps } from "react";

/**
 * Shared props for brand-mark SVGs. Sizing and color flow through `className`;
 * `fill`/`viewBox`/`xmlns` are owned by each mark and not overridable.
 */
export type BrandIconProps = Omit<SVGProps<SVGSVGElement>, "fill" | "viewBox" | "xmlns">;
