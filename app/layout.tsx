import { TimeZoneProvider } from "@/components/ui/hooks/use-time-zone";
import { ThemeProvider } from "@/components/ui/shell/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { getRequestTimeZone } from "@/lib/time/request-tz";
import { cn } from "@/lib/utils";
import type { Metadata } from "next";
import { Geist_Mono, Space_Grotesk } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
    subsets: ["latin"],
    variable: "--font-space-grotesk",
    display: "swap",
});
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://bursora.com"),
    title: "Bursora",
    description: "AI agent cost management with hard budget enforcement.",
    twitter: {
        card: "summary_large_image",
        title: "Bursora",
        description: "AI agent cost management with hard budget enforcement.",
    },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
    const tz = await getRequestTimeZone();
    return (
        <html
            lang="en"
            className={cn(spaceGrotesk.variable, geistMono.variable)}
            suppressHydrationWarning
        >
            <body>
                <TimeZoneProvider tz={tz}>
                    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
                        {children}
                        <Toaster richColors />
                    </ThemeProvider>
                </TimeZoneProvider>
            </body>
        </html>
    );
}
