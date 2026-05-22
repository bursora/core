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
import { LogOut, UserCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

interface UserMenuProps {
    userId: string;
    name: string;
    email: string;
}

export function UserMenu({ userId, name, email }: UserMenuProps) {
    const router = useRouter();
    const [signingOut, setSigningOut] = useState(false);

    async function handleSignOut() {
        setSigningOut(true);
        try {
            await authClient.signOut();
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
                <UserAvatar size="md" userId={userId} name={name} email={email} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
                <div className="flex items-center gap-2 px-2 py-1.5">
                    <UserAvatar size="md" userId={userId} name={name} email={email} />
                    <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{name}</div>
                        <div className="truncate text-xs text-muted-foreground">{email}</div>
                    </div>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                    <Link href="/profile">
                        <UserCircle className="mr-2 h-4 w-4" /> Profile
                    </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled={signingOut} onSelect={handleSignOut}>
                    <LogOut className="mr-2 h-4 w-4" /> Sign out
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
