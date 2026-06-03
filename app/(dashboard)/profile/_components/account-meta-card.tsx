import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, formatRelativeTime } from "@/lib/format";

interface AccountMetaCardProps {
    readonly createdAt: Date;
    readonly sessionCreatedAt: Date;
    readonly tz: string;
}

export function AccountMetaCard({ createdAt, sessionCreatedAt, tz }: AccountMetaCardProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Account details</CardTitle>
                <CardDescription>Session metadata for your account.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
                <Field label="Created" value={formatDate(createdAt, tz)} />
                <Field label="Last sign-in" value={formatRelativeTime(sessionCreatedAt)} />
            </CardContent>
        </Card>
    );
}

interface FieldProps {
    readonly label: string;
    readonly value: string;
}

function Field({ label, value }: FieldProps) {
    return (
        <div className="space-y-1">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {label}
            </div>
            <div className="text-sm tabular-nums">{value}</div>
        </div>
    );
}
