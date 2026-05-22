import { Button } from "../button";
import { Card, CardContent } from "../card";
import type { LucideIcon } from "lucide-react";

interface EmptyStateCardProps {
    readonly icon: LucideIcon;
    readonly title: string;
    readonly description: string;
    readonly action?: {
        readonly label: string;
        readonly icon?: LucideIcon;
        readonly onClick: () => void;
    };
}

export function EmptyStateCard({ icon: Icon, title, description, action }: EmptyStateCardProps) {
    const ActionIcon = action?.icon;
    return (
        <Card>
            <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                <div className="grid size-10 place-items-center rounded-full bg-primary/10 text-primary">
                    <Icon className="size-5" />
                </div>
                <div>
                    <h4 className="font-medium">{title}</h4>
                    <p className="mt-1 text-sm text-muted-foreground">{description}</p>
                </div>
                {action && (
                    <Button size="sm" onClick={action.onClick}>
                        {ActionIcon && <ActionIcon className="size-4" />}
                        {action.label}
                    </Button>
                )}
            </CardContent>
        </Card>
    );
}
