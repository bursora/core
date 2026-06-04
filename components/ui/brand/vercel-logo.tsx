import type { BrandIconProps } from "./types";

export function VercelLogo({ className, ...props }: BrandIconProps) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            aria-hidden="true"
            className={className}
            fill="currentColor"
            {...props}
        >
            <path d="M24 22.525H0l12-21.05 12 21.05z" />
        </svg>
    );
}
