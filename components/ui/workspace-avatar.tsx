import { AVATAR_SIZES, avatarInitials, avatarPaletteClass } from "@/lib/avatar";
import { cn } from "@/lib/utils";

export interface WorkspaceAvatarProps {
    readonly name: string;
    readonly workspaceId: string;
    readonly size?: keyof typeof AVATAR_SIZES;
    readonly className?: string;
}

export function WorkspaceAvatar({
    name,
    workspaceId,
    size = "md",
    className,
}: WorkspaceAvatarProps) {
    const initials = avatarInitials(name);
    const palette = avatarPaletteClass(workspaceId, "workspace");

    return (
        <span
            role="img"
            aria-label={name}
            className={cn(
                "inline-flex items-center justify-center select-none rounded-[6px] font-medium",
                AVATAR_SIZES[size],
                palette,
                className,
            )}
        >
            {initials}
        </span>
    );
}
