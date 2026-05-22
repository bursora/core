"use client";

/**
 * Global ⌘K palette. Renders four groups (Navigation, Workspaces, Actions,
 * Recent). Selecting any item records it via `pushRecentCommand` so the
 * Recent group stays useful between sessions.
 */

import {
    CommandDialog,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandSeparator,
    CommandShortcut,
} from "@/components/ui/command";
import { WorkspaceAvatar } from "@/components/ui/workspace-avatar";
import { buildWorkspacePath, buildWorkspaceSwitchUrl } from "@/lib/routes";
import type { LucideIcon } from "lucide-react";
import {
    AlertTriangle,
    Clock,
    KeyRound,
    LayoutDashboard,
    Plus,
    Receipt,
    SunMoon,
    Target,
} from "lucide-react";
import type { Route } from "next";
import { useTheme } from "next-themes";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useMemo, useSyncExternalStore } from "react";
import { setWorkspaceCookie, type WorkspaceOption } from "./app-shell-helpers";
import { loadRecentCommands, pushRecentCommand, subscribeRecentCommands } from "./recent-commands";

interface PaletteCommand {
    readonly id: string;
    readonly label: string;
    readonly icon: LucideIcon;
    readonly leading?: ReactNode;
    readonly shortcut?: string;
    readonly run: () => void;
    readonly disabled?: boolean;
}

interface CommandPaletteProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    workspaces: ReadonlyArray<WorkspaceOption>;
    activeWorkspaceId: string | null;
}

interface NavItem {
    readonly id: string;
    readonly label: string;
    readonly section?: string;
    readonly icon: LucideIcon;
    readonly shortcut: string;
}

const NAV_ITEMS: ReadonlyArray<NavItem> = [
    { id: "nav.dashboard", label: "Dashboard", icon: LayoutDashboard, shortcut: "g d" },
    { id: "nav.spend", label: "Spend", section: "spend", icon: Receipt, shortcut: "g s" },
    { id: "nav.budgets", label: "Budgets", section: "budgets", icon: Target, shortcut: "g b" },
    { id: "nav.alerts", label: "Alerts", section: "alerts", icon: AlertTriangle, shortcut: "g a" },
    { id: "nav.keys", label: "API keys", section: "keys", icon: KeyRound, shortcut: "g k" },
];

export function CommandPalette({
    open,
    onOpenChange,
    workspaces,
    activeWorkspaceId,
}: CommandPaletteProps) {
    const router = useRouter();
    const pathname = usePathname();
    const { theme, setTheme } = useTheme();
    const recentIds = useSyncExternalStore(
        subscribeRecentCommands,
        loadRecentCommands,
        loadRecentCommands,
    );

    function dispatch(command: PaletteCommand): void {
        pushRecentCommand(command.id);
        onOpenChange(false);
        command.run();
    }

    const navCommands = useMemo<ReadonlyArray<PaletteCommand>>(() => {
        if (!activeWorkspaceId) return [];
        return NAV_ITEMS.map((item) => {
            const target = buildWorkspacePath(activeWorkspaceId, item.section);
            return {
                id: item.id,
                label: item.label,
                icon: item.icon,
                shortcut: item.shortcut,
                disabled: pathname === target,
                run: () => router.push(target),
            };
        });
    }, [activeWorkspaceId, pathname, router]);

    const workspaceCommands = useMemo<ReadonlyArray<PaletteCommand>>(() => {
        return workspaces.map((ws) => ({
            id: `workspace.${ws.id}`,
            label: ws.name,
            icon: LayoutDashboard,
            leading: <WorkspaceAvatar name={ws.name} workspaceId={ws.id} size="xs" />,
            run: () => {
                setWorkspaceCookie(ws.id);
                router.replace(buildWorkspaceSwitchUrl(pathname, ws.id) as Route);
            },
        }));
    }, [workspaces, pathname, router]);

    const actionCommands = useMemo<ReadonlyArray<PaletteCommand>>(() => {
        const items: Array<PaletteCommand> = [];
        if (activeWorkspaceId) {
            items.push({
                id: "action.issue-key",
                label: "Issue API key",
                icon: KeyRound,
                run: () =>
                    router.push(buildWorkspacePath(activeWorkspaceId, "keys", { action: "issue" })),
            });
            items.push({
                id: "action.create-budget",
                label: "Create budget",
                icon: Plus,
                run: () =>
                    router.push(
                        buildWorkspacePath(activeWorkspaceId, "budgets", { action: "new" }),
                    ),
            });
        }
        items.push({
            id: "action.toggle-theme",
            label: "Toggle theme",
            icon: SunMoon,
            shortcut: "⌘ /",
            run: () => setTheme(theme === "dark" ? "light" : "dark"),
        });
        return items;
    }, [activeWorkspaceId, router, setTheme, theme]);

    const allCommands = useMemo<ReadonlyArray<PaletteCommand>>(
        () => [...navCommands, ...workspaceCommands, ...actionCommands],
        [navCommands, workspaceCommands, actionCommands],
    );

    const recentCommands = useMemo<ReadonlyArray<PaletteCommand>>(() => {
        return recentIds
            .map((id) => allCommands.find((cmd) => cmd.id === id))
            .filter((cmd): cmd is PaletteCommand => Boolean(cmd));
    }, [recentIds, allCommands]);

    return (
        <CommandDialog open={open} onOpenChange={onOpenChange}>
            <CommandInput placeholder="Type a command or search..." />
            <CommandList>
                <CommandEmpty>No commands found.</CommandEmpty>

                <CommandGroup heading="Navigation">
                    {navCommands.map((cmd) => (
                        <PaletteRow key={cmd.id} command={cmd} onPick={dispatch} />
                    ))}
                </CommandGroup>

                {workspaceCommands.length > 0 ? (
                    <>
                        <CommandSeparator />
                        <CommandGroup heading="Workspaces">
                            {workspaceCommands.map((cmd) => (
                                <PaletteRow key={cmd.id} command={cmd} onPick={dispatch} />
                            ))}
                        </CommandGroup>
                    </>
                ) : null}

                <CommandSeparator />
                <CommandGroup heading="Actions">
                    {actionCommands.map((cmd) => (
                        <PaletteRow key={cmd.id} command={cmd} onPick={dispatch} />
                    ))}
                </CommandGroup>

                {recentCommands.length > 0 ? (
                    <>
                        <CommandSeparator />
                        <CommandGroup heading="Recent">
                            {recentCommands.map((cmd) => (
                                <PaletteRow
                                    key={`recent.${cmd.id}`}
                                    command={cmd}
                                    onPick={dispatch}
                                    fallbackIcon={Clock}
                                />
                            ))}
                        </CommandGroup>
                    </>
                ) : null}
            </CommandList>
        </CommandDialog>
    );
}

interface PaletteRowProps {
    command: PaletteCommand;
    onPick: (command: PaletteCommand) => void;
    fallbackIcon?: LucideIcon;
}

function PaletteRow({ command, onPick, fallbackIcon }: PaletteRowProps) {
    const Icon = fallbackIcon ?? command.icon;
    const showLeading = command.leading && !fallbackIcon;
    return (
        <CommandItem
            value={command.label}
            disabled={command.disabled ?? false}
            onSelect={() => {
                if (command.disabled) return;
                onPick(command);
            }}
        >
            {showLeading ? (
                <span className="mr-2 inline-flex shrink-0 items-center justify-center">
                    {command.leading}
                </span>
            ) : (
                <Icon className="mr-2 h-4 w-4" />
            )}
            <span>{command.label}</span>
            {command.shortcut ? <CommandShortcut>{command.shortcut}</CommandShortcut> : null}
        </CommandItem>
    );
}
