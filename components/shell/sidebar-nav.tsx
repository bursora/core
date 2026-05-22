"use client";

import {
    SidebarGroup,
    SidebarGroupContent,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarSeparator,
} from "@/components/ui/sidebar";
import { buildWorkspacePath } from "@/lib/routes";
import {
    AlertTriangle,
    KeyRound,
    LayoutDashboard,
    Receipt,
    Settings,
    Target,
    Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { isActiveLink } from "./app-shell-helpers";

interface SidebarNavProps {
    activeWorkspaceId: string | null;
}

interface NavLink {
    readonly section?: string;
    readonly label: string;
    readonly Icon: typeof LayoutDashboard;
}

const PRIMARY_LINKS: ReadonlyArray<NavLink> = [
    { label: "Dashboard", Icon: LayoutDashboard },
    { section: "spend", label: "Spend", Icon: Receipt },
    { section: "budgets", label: "Budgets", Icon: Target },
    { section: "alerts", label: "Alerts", Icon: AlertTriangle },
    { section: "settings", label: "Settings", Icon: Settings },
];

const SECONDARY_LINKS: ReadonlyArray<NavLink> = [
    { section: "keys", label: "API keys", Icon: KeyRound },
    { section: "members", label: "Members", Icon: Users },
];

const ACTIVE_INDICATOR =
    "border-l-2 border-transparent data-[active=true]:rounded-none data-[active=true]:bg-foreground/5 data-[active=true]:border-foreground data-[active=true]:text-foreground";

export function SidebarNav({ activeWorkspaceId }: SidebarNavProps) {
    const pathname = usePathname();
    if (!activeWorkspaceId) return null;

    const renderLink = ({ section, label, Icon }: NavLink) => {
        const href = buildWorkspacePath(activeWorkspaceId, section);
        return (
            <SidebarMenuItem key={label}>
                <SidebarMenuButton
                    asChild
                    isActive={isActiveLink(pathname, href)}
                    className={ACTIVE_INDICATOR}
                >
                    <Link href={href}>
                        <Icon />
                        <span>{label}</span>
                    </Link>
                </SidebarMenuButton>
            </SidebarMenuItem>
        );
    };

    return (
        <>
            <SidebarGroup>
                <SidebarGroupContent>
                    <SidebarMenu>{PRIMARY_LINKS.map(renderLink)}</SidebarMenu>
                </SidebarGroupContent>
            </SidebarGroup>
            <SidebarSeparator />
            <SidebarGroup>
                <SidebarGroupContent>
                    <SidebarMenu>{SECONDARY_LINKS.map(renderLink)}</SidebarMenu>
                </SidebarGroupContent>
            </SidebarGroup>
        </>
    );
}
