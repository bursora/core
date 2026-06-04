"use client";

import { AVATAR_SIZES, avatarInitials, avatarPaletteClass } from "@/lib/avatar";
import { cn } from "@/lib/utils";
import { useState } from "react";

export interface UserAvatarProps {
    readonly name: string;
    readonly userId: string;
    readonly email?: string;
    /** Provider photo (e.g. Google). Falls back to initials when absent or it fails to load. */
    readonly image?: string | null | undefined;
    readonly size?: keyof typeof AVATAR_SIZES;
    readonly className?: string;
}

export function UserAvatar({
    name,
    userId,
    email,
    image,
    size = "md",
    className,
}: UserAvatarProps) {
    const [failed, setFailed] = useState(false);

    if (image && !failed) {
        return (
            // eslint-disable-next-line @next/next/no-img-element -- provider avatar host is arbitrary; plain img avoids next.config remotePatterns churn
            <img
                src={image}
                alt={name}
                referrerPolicy="no-referrer"
                onError={() => setFailed(true)}
                className={cn(
                    "inline-block shrink-0 select-none rounded-full object-cover",
                    AVATAR_SIZES[size],
                    className,
                )}
            />
        );
    }

    const initials = avatarInitials(name, email);
    const palette = avatarPaletteClass(userId, "user");

    return (
        <span
            role="img"
            aria-label={name}
            className={cn(
                "inline-flex items-center justify-center select-none rounded-full font-medium",
                AVATAR_SIZES[size],
                palette,
                className,
            )}
        >
            {initials}
        </span>
    );
}
