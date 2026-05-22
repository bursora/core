/**
 * Centered-card shell for unauthenticated and transitional pages
 * (login, accept-invite, create-workspace).
 *
 * Composition:
 *   <AuthShell title="Sign in" description="...">
 *     ...form...
 *     <AuthShellFooter>link</AuthShellFooter>
 *   </AuthShell>
 *
 * The root layout already mounts <Toaster /> — do not mount another here.
 */

import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface AuthShellProps {
    readonly title: string;
    readonly description?: string;
    readonly logo?: ReactNode;
    readonly children: ReactNode;
    readonly footer?: ReactNode;
    readonly className?: string;
}

export function AuthShell({
    title,
    description,
    logo,
    children,
    footer,
    className,
}: AuthShellProps) {
    return (
        <main className="flex min-h-svh items-center justify-center bg-background px-4 py-10">
            <Card className={cn("w-full max-w-[440px]", className)}>
                <CardHeader className="text-center">
                    {logo ? <div className="mb-2 flex justify-center">{logo}</div> : null}
                    <CardTitle className="text-2xl">{title}</CardTitle>
                    {description ? <CardDescription>{description}</CardDescription> : null}
                </CardHeader>
                <CardContent>{children}</CardContent>
                {footer ? (
                    <CardFooter className="justify-center text-sm text-muted-foreground">
                        {footer}
                    </CardFooter>
                ) : null}
            </Card>
        </main>
    );
}
