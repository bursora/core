import { AuthShell } from "@/components/shell/auth-shell";
import { Button } from "@/components/ui/button";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
    title: "Account scheduled for deletion — Bursora",
};

export default function AccountDeletedPage() {
    return (
        <AuthShell
            title="Account scheduled for deletion"
            description="Your account is suspended and you've been signed out. We'll permanently delete it, along with any workspace you alone own, 24 hours from now."
            footer={
                <Button asChild variant="link" className="h-auto p-0">
                    <a href={process.env.NEXT_PUBLIC_SITE_URL}>Back to bursora.com</a>
                </Button>
            }
        >
            <div className="flex flex-col gap-4">
                <p className="text-sm text-muted-foreground">
                    Changed your mind? Sign back in within 24 hours to cancel the deletion and
                    restore everything — your keys start working again immediately.
                </p>
                <Button asChild className="w-full">
                    <Link href="/login">Sign back in</Link>
                </Button>
            </div>
        </AuthShell>
    );
}
