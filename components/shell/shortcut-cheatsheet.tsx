"use client";

/**
 * Two-column reference for every global shortcut. Opens when the user presses
 * `?` anywhere outside an input.
 */

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

interface ShortcutCheatsheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

const SHORTCUTS: ReadonlyArray<{ keys: string; label: string }> = [
    { keys: "⌘ K", label: "Open command palette" },
    { keys: "?", label: "Show this cheatsheet" },
    { keys: "⌘ /", label: "Toggle theme" },
    { keys: "g d", label: "Go to Dashboard" },
    { keys: "g s", label: "Go to Spend" },
    { keys: "g b", label: "Go to Budgets" },
    { keys: "g a", label: "Go to Alerts" },
    { keys: "g k", label: "Go to API keys" },
];

export function ShortcutCheatsheet({ open, onOpenChange }: ShortcutCheatsheetProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Keyboard shortcuts</DialogTitle>
                    <DialogDescription>
                        Press these keys anywhere outside an input field.
                    </DialogDescription>
                </DialogHeader>
                <table className="w-full text-sm">
                    <tbody>
                        {SHORTCUTS.map((row) => (
                            <tr key={row.keys} className="border-b last:border-b-0">
                                <td className="py-2 pr-4">
                                    <kbd className="rounded border bg-muted px-2 py-0.5 font-mono text-xs">
                                        {row.keys}
                                    </kbd>
                                </td>
                                <td className="py-2 text-muted-foreground">{row.label}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </DialogContent>
        </Dialog>
    );
}
