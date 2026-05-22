import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export const metadata = {
    title: "Page not found · Bursora",
};

export default function NotFound() {
    return (
        <main className="grid min-h-dvh place-items-center bg-background px-6 text-foreground">
            <div className="mx-auto max-w-md text-center">
                <p className="text-7xl font-semibold tracking-tight text-foreground sm:text-8xl">
                    404
                </p>
                <h1 className="mt-6 text-xl font-medium tracking-tight sm:text-2xl">
                    Page not found
                </h1>
                <p className="mt-3 text-sm text-muted-foreground">
                    The page you’re looking for doesn’t exist or has moved.
                </p>
                <div className="mt-8">
                    <Button asChild>
                        <Link href="/">
                            <ArrowLeft className="size-4" />
                            Back home
                        </Link>
                    </Button>
                </div>
            </div>
        </main>
    );
}
