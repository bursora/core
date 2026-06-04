import type { BrandIconProps } from "./types";

export function AnthropicLogo({ className, ...props }: BrandIconProps) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            aria-hidden="true"
            className={className}
            fill="currentColor"
            {...props}
        >
            <path d="M17.3041 3.541H13.7161L20.2645 20.4591H23.8525L17.3041 3.541ZM6.69587 3.541L0.147461 20.4591H3.81233L5.15145 16.9853H11.9999L13.339 20.4591H17.0039L10.4555 3.541H6.69587ZM6.36849 13.8769L8.57569 8.16216L10.7829 13.8769H6.36849Z" />
        </svg>
    );
}
