"use client";

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserAvatar } from "@/components/ui/user-avatar";
import { authClient } from "@/lib/auth-client";
import { Activity, CreditCard, LogOut, UserCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import posthog from "posthog-js";
import { useState } from "react";
import { toast } from "sonner";

interface UserMenuProps {
    userId: string;
    name: string;
    email: string;
    image?: string | null | undefined;
    /** Cloud only: surfaces the account billing entry (hidden on self-host). */
    showBilling?: boolean;
    /** Platform admins get the operator-only system status entry. */
    isAdmin?: boolean;
}

export function UserMenu({ userId, name, email, image, showBilling, isAdmin }: UserMenuProps) {
    const router = useRouter();
    const [signingOut, setSigningOut] = useState(false);

    async function handleSignOut() {
        setSigningOut(true);
        try {
            await authClient.signOut();
            // Drop the identified person so a shared browser doesn't attribute
            // the next visitor's events to the user who just left. No-ops when
            // analytics is off.
            if (posthog.__loaded) posthog.reset();
            router.replace("/login");
            router.refresh();
        } catch (err) {
            toast.error("Sign out failed");
            setSigningOut(false);
            throw err;
        }
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger
                type="button"
                aria-label="Account menu"
                className="cursor-pointer rounded-full outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
                <UserAvatar size="md" userId={userId} name={name} email={email} image={image} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
                <div className="flex items-center gap-2 px-2 py-1.5">
                    <UserAvatar size="md" userId={userId} name={name} email={email} image={image} />
                    <div className="min-w-0 flex-1">
                        <div className="ph-no-capture truncate text-sm font-medium">{name}</div>
                        <div className="ph-no-capture truncate text-xs text-muted-foreground">
                            {email}
                        </div>
                    </div>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                    <Link href="/profile">
                        <UserCircle className="mr-2 h-4 w-4" /> Profile
                    </Link>
                </DropdownMenuItem>
                {isAdmin ? (
                    <DropdownMenuItem asChild>
                        <Link href="/system/status">
                            <Activity className="mr-2 h-4 w-4" /> System status
                        </Link>
                    </DropdownMenuItem>
                ) : null}
                {showBilling ? (
                    <DropdownMenuItem asChild>
                        <Link href="/billing">
                            <CreditCard className="mr-2 h-4 w-4" /> Billing
                        </Link>
                    </DropdownMenuItem>
                ) : null}
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled={signingOut} onSelect={handleSignOut}>
                    <LogOut className="mr-2 h-4 w-4" /> Sign out
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
