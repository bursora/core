"use client";

/**
 * Settings tab shell. Wraps shadcn <Tabs> and syncs the active tab to the
 * `?tab=` query string. Server panels are passed in as children — the tab
 * value is whichever child has a matching `data-tab` attribute on its
 * wrapper.
 */

import {
    SETTINGS_TAB_LABELS,
    type SettingsTab,
} from "@/app/(dashboard)/workspace/[workspaceId]/settings/tabs";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { buildWorkspacePath } from "@/lib/routes";
import { useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

interface TabsClientProps {
    workspaceId: string;
    activeTab: SettingsTab;
    tabs: readonly SettingsTab[];
    panels: Partial<Record<SettingsTab, ReactNode>>;
}

export function TabsClient({ workspaceId, activeTab, tabs, panels }: TabsClientProps) {
    const router = useRouter();
    const searchParams = useSearchParams();

    const onChange = (next: string) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set("tab", next);
        router.replace(`${buildWorkspacePath(workspaceId, "settings")}?${params.toString()}`);
    };

    return (
        <Tabs value={activeTab} onValueChange={onChange} className="w-full">
            <TabsList>
                {tabs.map((t) => (
                    <TabsTrigger key={t} value={t}>
                        {SETTINGS_TAB_LABELS[t]}
                    </TabsTrigger>
                ))}
            </TabsList>
            {tabs.map((t) => (
                <TabsContent key={t} value={t} className="mt-4">
                    {panels[t]}
                </TabsContent>
            ))}
        </Tabs>
    );
}
