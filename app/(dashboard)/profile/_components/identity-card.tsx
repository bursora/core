import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ProfileForm } from "./profile-form";

interface IdentityCardProps {
    readonly currentName: string;
}

export function IdentityCard({ currentName }: IdentityCardProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Display name</CardTitle>
                <CardDescription>Shown next to your avatar across Bursora.</CardDescription>
            </CardHeader>
            <CardContent>
                <ProfileForm currentName={currentName} />
            </CardContent>
        </Card>
    );
}
