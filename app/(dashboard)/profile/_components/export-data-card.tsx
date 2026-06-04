import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Download } from "lucide-react";

export function ExportDataCard() {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Export your data</CardTitle>
                <CardDescription>
                    Download a JSON copy of your account: your profile, every workspace you belong
                    to, and each one&apos;s API key details, budgets, alert rules, and usage
                    summary. Secrets like raw API keys and webhook URLs are never included.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Button asChild variant="outline">
                    <a href="/api/internal/user/export" download>
                        <Download />
                        Download my data
                    </a>
                </Button>
            </CardContent>
        </Card>
    );
}
