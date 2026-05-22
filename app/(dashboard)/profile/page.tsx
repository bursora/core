import { UserAvatar } from "@/components/ui/user-avatar";
import { requireSessionUI } from "@/lib/auth";
import { AccountMetaCard } from "./_components/account-meta-card";
import { IdentityCard } from "./_components/identity-card";
import { VerificationBadge } from "./_components/verification-badge";

export default async function ProfilePage() {
    const session = await requireSessionUI();
    const user = session.user;

    return (
        <div className="mx-auto max-w-2xl space-y-6">
            <header className="flex items-center gap-4">
                <UserAvatar size="xl" userId={user.id} name={user.name} email={user.email} />
                <div className="min-w-0 space-y-1">
                    <h1 className="truncate text-2xl font-semibold tracking-tight">{user.name}</h1>
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm text-muted-foreground">{user.email}</span>
                        <VerificationBadge verified={user.emailVerified} />
                    </div>
                </div>
            </header>

            <IdentityCard currentName={user.name} />
            <AccountMetaCard
                createdAt={user.createdAt}
                sessionCreatedAt={session.session.createdAt}
            />
        </div>
    );
}
