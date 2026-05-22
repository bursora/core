"use client";

/**
 * Global keyboard layer. Mounted once at the dashboard root. Owns the
 * open/close state for the command palette and cheatsheet, and registers
 * every app-wide shortcut via react-hotkeys-hook.
 */

import { CommandPalette } from "@/components/shell/command-palette";
import { ShortcutCheatsheet } from "@/components/shell/shortcut-cheatsheet";
import { buildWorkspacePath } from "@/lib/routes";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { type WorkspaceOption } from "./app-shell-helpers";

interface KeyboardShortcutsProps {
    workspaces: ReadonlyArray<WorkspaceOption>;
    activeWorkspaceId: string | null;
}

export function KeyboardShortcuts({ workspaces, activeWorkspaceId }: KeyboardShortcutsProps) {
    const router = useRouter();
    const { theme, setTheme } = useTheme();
    const [paletteOpen, setPaletteOpen] = useState(false);
    const [cheatsheetOpen, setCheatsheetOpen] = useState(false);

    useHotkeys(
        "mod+k",
        (event) => {
            event.preventDefault();
            setPaletteOpen((current) => !current);
        },
        { preventDefault: true },
    );

    useHotkeys("shift+/", () => {
        setCheatsheetOpen(true);
    });

    useHotkeys(
        "mod+/",
        (event) => {
            event.preventDefault();
            setTheme(theme === "dark" ? "light" : "dark");
        },
        { preventDefault: true },
        [theme, setTheme],
    );

    function go(section?: string): void {
        if (!activeWorkspaceId) return;
        router.push(buildWorkspacePath(activeWorkspaceId, section));
    }

    useHotkeys("g>d", () => go(), [activeWorkspaceId]);
    useHotkeys("g>s", () => go("spend"), [activeWorkspaceId]);
    useHotkeys("g>b", () => go("budgets"), [activeWorkspaceId]);
    useHotkeys("g>a", () => go("alerts"), [activeWorkspaceId]);
    useHotkeys("g>k", () => go("keys"), [activeWorkspaceId]);

    return (
        <>
            <CommandPalette
                open={paletteOpen}
                onOpenChange={setPaletteOpen}
                workspaces={workspaces}
                activeWorkspaceId={activeWorkspaceId}
            />
            <ShortcutCheatsheet open={cheatsheetOpen} onOpenChange={setCheatsheetOpen} />
        </>
    );
}
