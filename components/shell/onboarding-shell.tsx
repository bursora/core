/**
 * Chrome-free shell for the setup wizard. No sidebar, no workspace topbar: just
 * the brand mark top-left and the theme toggle + account menu (sign-out)
 * top-right, with the wizard centered in a single narrow column. Used only by
 * the onboarding flow; the dashboard keeps `AppShell`.
 */

import { ThemeToggle } from "@/components/shell/theme-toggle";
import { UserMenu } from "@/components/shell/user-menu";
import { Logo } from "@/components/ui/brand/logo";
import { requireSessionUI } from "@/lib/auth";
import { env } from "@/lib/env";
import type { ReactNode } from "react";

export async function OnboardingShell({ children }: { readonly children: ReactNode }) {
    const session = await requireSessionUI();
    return (
        <div className="flex min-h-dvh flex-col bg-background">
            <header className="flex items-center justify-between px-4 py-4 sm:px-6">
                <span className="flex items-center gap-2">
                    <Logo className="size-6" />
                    <span className="text-sm font-semibold tracking-[-0.01em]">Bursora</span>
                </span>
                <div className="flex items-center gap-1">
                    <ThemeToggle />
                    <UserMenu
                        userId={session.user.id}
                        name={session.user.name}
                        email={session.user.email}
                        showBilling={env().IS_CLOUD}
                    />
                </div>
            </header>
            <main className="flex flex-1 justify-center px-4 pb-16 pt-6 sm:pt-12">
                <div className="w-full max-w-[520px]">{children}</div>
            </main>
        </div>
    );
}
