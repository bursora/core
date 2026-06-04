"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Loader2 } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

export function ExportDataCard() {
    const [pending, startTransition] = useTransition();

    function onDownload() {
        startTransition(async () => {
            try {
                const res = await fetch("/api/internal/user/export");
                if (!res.ok) {
                    throw new Error(`Export failed (${res.status})`);
                }
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "bursora-data-export.json";
                a.click();
                URL.revokeObjectURL(url);
            } catch {
                toast.error("Could not export your data. Try again.");
            }
        });
    }

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
                <Button variant="outline" onClick={onDownload} disabled={pending}>
                    {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Download />}
                    Download my data
                </Button>
            </CardContent>
        </Card>
    );
}
