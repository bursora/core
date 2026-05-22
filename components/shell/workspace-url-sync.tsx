"use client";

import { extractWorkspaceIdFromPath } from "@/lib/routes";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { setWorkspaceCookie } from "./app-shell-helpers";

export function WorkspaceUrlSync() {
    const pathname = usePathname();
    const lastWritten = useRef<string | null>(null);
    useEffect(() => {
        const workspace = extractWorkspaceIdFromPath(pathname);
        if (!workspace) return;
        if (lastWritten.current === workspace) return;
        lastWritten.current = workspace;
        setWorkspaceCookie(workspace);
    }, [pathname]);
    return null;
}
