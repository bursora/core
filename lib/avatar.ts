/**
 * Shared avatar primitives. Pure helpers that derive deterministic initials
 * and a stable palette index from an id; consumed by both `UserAvatar`
 * (round, derived from `userId`) and `WorkspaceAvatar` (square, derived
 * from `workspaceId`). Keep this layer free of React so the helpers can be
 * unit-tested directly and reused server-side.
 */

export const AVATAR_SIZES = {
    xs: "h-5 w-5 text-[10px]",
    sm: "h-6 w-6 text-xs",
    md: "h-8 w-8 text-sm",
    lg: "h-12 w-12 text-base",
    xl: "h-24 w-24 text-4xl",
} as const;

export type AvatarKind = "user" | "workspace";

export const WORKSPACE_PALETTE: readonly string[] = [
    "bg-slate-100 text-slate-900 dark:bg-slate-800/60 dark:text-slate-100",
    "bg-zinc-100 text-zinc-900 dark:bg-zinc-800/60 dark:text-zinc-100",
    "bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-100",
    "bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-100",
    "bg-indigo-100 text-indigo-900 dark:bg-indigo-900/40 dark:text-indigo-100",
    "bg-violet-100 text-violet-900 dark:bg-violet-900/40 dark:text-violet-100",
    "bg-purple-100 text-purple-900 dark:bg-purple-900/40 dark:text-purple-100",
    "bg-teal-100 text-teal-900 dark:bg-teal-900/40 dark:text-teal-100",
    "bg-cyan-100 text-cyan-900 dark:bg-cyan-900/40 dark:text-cyan-100",
    "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100",
    "bg-neutral-100 text-neutral-900 dark:bg-neutral-800/60 dark:text-neutral-100",
] as const;

export const USER_PALETTE: readonly string[] = [
    "bg-rose-100 text-rose-900 dark:bg-rose-900/40 dark:text-rose-100",
    "bg-pink-100 text-pink-900 dark:bg-pink-900/40 dark:text-pink-100",
    "bg-fuchsia-100 text-fuchsia-900 dark:bg-fuchsia-900/40 dark:text-fuchsia-100",
    "bg-orange-100 text-orange-900 dark:bg-orange-900/40 dark:text-orange-100",
    "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100",
    "bg-yellow-100 text-yellow-900 dark:bg-yellow-900/40 dark:text-yellow-100",
    "bg-lime-100 text-lime-900 dark:bg-lime-900/40 dark:text-lime-100",
    "bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-100",
    "bg-stone-100 text-stone-900 dark:bg-stone-800/60 dark:text-stone-100",
    "bg-gray-100 text-gray-900 dark:bg-gray-800/60 dark:text-gray-100",
] as const;

const PALETTES: Record<AvatarKind, readonly string[]> = {
    workspace: WORKSPACE_PALETTE,
    user: USER_PALETTE,
};

const FNV_OFFSET = 2166136261;
const FNV_PRIME = 16777619;

export function avatarInitials(name: string, email?: string): string {
    const tokens = tokenize(name, /\s+/u);

    if (tokens.length === 0 && email) {
        const localPart = email.split("@")[0] ?? "";
        return initialsFromTokens(tokenize(localPart, /[.\-_+\s]+/u));
    }

    return initialsFromTokens(tokens);
}

const tokenize = (input: string, separator: RegExp): readonly string[] =>
    input
        .split(separator)
        .map((token) => token.replace(/[^\p{L}\p{N}]/gu, ""))
        .filter((token) => token.length > 0);

const initialsFromTokens = (tokens: readonly string[]): string => {
    if (tokens.length === 0) return "?";

    if (tokens.length === 1) {
        const only = tokens[0] ?? "";
        return only.slice(0, 2).toUpperCase();
    }

    const first = tokens[0] ?? "";
    const last = tokens[tokens.length - 1] ?? "";
    return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
};

export function avatarPaletteClass(id: string, kind: AvatarKind): string {
    const palette = PALETTES[kind];
    let hash = FNV_OFFSET;
    for (let i = 0; i < id.length; i += 1) {
        hash ^= id.charCodeAt(i);
        hash = Math.imul(hash, FNV_PRIME) >>> 0;
    }
    return palette[hash % palette.length] ?? palette[0] ?? "";
}
