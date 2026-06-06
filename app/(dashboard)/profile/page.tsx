import { AppShell } from "@/components/shell/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UserAvatar } from "@/components/ui/user-avatar";
import { requireSessionUI } from "@/lib/auth";
import { getRequestTimeZone } from "@/lib/time/request-tz";
import { Check } from "lucide-react";
import { AccountMetaCard } from "./_components/account-meta-card";
import { DeleteAccountCard } from "./_components/delete-account-card";
import { ExportDataCard } from "./_components/export-data-card";
import { ProfileForm } from "./_components/profile-form";

export default async function ProfilePage() {
    const session = await requireSessionUI();
    const user = session.user;
    const tz = await getRequestTimeZone();

    return (
        <AppShell>
            <div className="mx-auto max-w-2xl space-y-6">
                <header className="flex items-center gap-4">
                    <UserAvatar
                        size="xl"
                        userId={user.id}
                        name={user.name}
                        email={user.email}
                        image={user.image}
                    />
                    <div className="min-w-0 space-y-1">
                        <h1 className="ph-no-capture truncate text-2xl font-semibold tracking-tight">
                            {user.name}
                        </h1>
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="ph-no-capture truncate text-sm text-muted-foreground">
                                {user.email}
                            </span>
                            <Badge
                                variant="secondary"
                                className={
                                    user.emailVerified
                                        ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100"
                                        : "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100"
                                }
                            >
                                {user.emailVerified ? <Check /> : null}
                                {user.emailVerified ? "Verified" : "Unverified"}
                            </Badge>
                        </div>
                    </div>
                </header>

                <Card>
                    <CardHeader>
                        <CardTitle>Display name</CardTitle>
                        <CardDescription>Shown next to your avatar across Bursora.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ProfileForm currentName={user.name} />
                    </CardContent>
                </Card>
                <AccountMetaCard
                    createdAt={user.createdAt}
                    sessionCreatedAt={session.session.createdAt}
                    tz={tz}
                />
                <ExportDataCard />
                <DeleteAccountCard email={user.email} />
            </div>
        </AppShell>
    );
}
