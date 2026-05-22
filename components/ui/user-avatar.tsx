import { AVATAR_SIZES, avatarInitials, avatarPaletteClass } from "@/lib/avatar";
import { cn } from "@/lib/utils";

export interface UserAvatarProps {
    readonly name: string;
    readonly userId: string;
    readonly email?: string;
    readonly size?: keyof typeof AVATAR_SIZES;
    readonly className?: string;
}

export function UserAvatar({ name, userId, email, size = "md", className }: UserAvatarProps) {
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
