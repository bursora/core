"use client";

import { Button } from "@/components/ui/button";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandSeparator,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { WorkspaceAvatar } from "@/components/ui/workspace-avatar";
import { buildWorkspaceSwitchUrl } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useId, useState } from "react";
import { setWorkspaceCookie, type WorkspaceOption } from "./app-shell-helpers";

interface WorkspaceSwitcherProps {
    workspaces: ReadonlyArray<WorkspaceOption>;
    activeWorkspaceId: string | null;
    children: ReactNode;
}

export function WorkspaceSwitcher({
    workspaces,
    activeWorkspaceId,
    children,
}: WorkspaceSwitcherProps) {
    const router = useRouter();
    const pathname = usePathname();
    const [open, setOpen] = useState(false);
    const listboxId = useId();

    function selectWorkspace(id: string) {
        setWorkspaceCookie(id);
        setOpen(false);
        router.replace(buildWorkspaceSwitchUrl(pathname, id) as Route);
    }

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    variant="ghost"
                    role="combobox"
                    aria-label="Switch workspace"
                    aria-expanded={open}
                    aria-controls={listboxId}
                    className="h-auto w-full justify-start gap-2.5 px-1 py-1 text-left font-normal has-[>svg]:px-1"
                >
                    {children}
                    <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-0" align="end" id={listboxId}>
                <Command>
                    <CommandInput placeholder="Search workspaces..." />
                    <CommandList>
                        <CommandEmpty>No workspaces found.</CommandEmpty>
                        <CommandGroup>
                            {workspaces.map((ws) => (
                                <CommandItem
                                    key={ws.id}
                                    value={ws.name}
                                    onSelect={() => selectWorkspace(ws.id)}
                                    className="gap-2"
                                >
                                    <WorkspaceAvatar name={ws.name} workspaceId={ws.id} size="xs" />
                                    <span className="ph-no-capture flex-1 truncate">{ws.name}</span>
                                    <Check
                                        className={cn(
                                            "h-4 w-4 shrink-0",
                                            ws.id === activeWorkspaceId
                                                ? "opacity-100"
                                                : "opacity-0",
                                        )}
                                    />
                                </CommandItem>
                            ))}
                        </CommandGroup>
                        <CommandSeparator />
                        <CommandGroup>
                            <CommandItem
                                value="__create_workspace__"
                                onSelect={() => {
                                    setOpen(false);
                                    router.push("/workspace/new" as Route);
                                }}
                                className="text-primary"
                            >
                                <Plus className="mr-2 h-4 w-4" />
                                Create workspace
                            </CommandItem>
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
