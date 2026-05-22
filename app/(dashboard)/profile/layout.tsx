import { AppShell } from "@/components/shell/app-shell";
import type { ReactNode } from "react";

interface ProfileLayoutProps {
    children: ReactNode;
}

export default function ProfileLayout({ children }: ProfileLayoutProps) {
    return <AppShell>{children}</AppShell>;
}
