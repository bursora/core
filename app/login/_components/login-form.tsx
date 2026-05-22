"use client";

import { AuthShell } from "@/components/shell/auth-shell";
import { Button } from "@/components/ui/button";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { authClient } from "@/lib/auth-client";
import { emailSchema } from "@/lib/email";
import { zodResolver } from "@hookform/resolvers/zod";
import { Mail } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const loginSchema = z.object({
    email: emailSchema,
});

type LoginValues = z.infer<typeof loginSchema>;

export function LoginForm() {
    const [sentTo, setSentTo] = useState<string | null>(null);
    const form = useForm<LoginValues>({
        resolver: zodResolver(loginSchema),
        defaultValues: { email: "" },
    });

    const onSubmit = async (values: LoginValues) => {
        const result = await authClient.signIn.magicLink({
            email: values.email,
            callbackURL: "/workspace",
        });
        if (result.error) {
            const message = result.error.message ?? "Failed to send magic link";
            form.setError("email", { message });
            toast.error(message);
            return;
        }
        setSentTo(values.email);
    };

    if (sentTo) {
        return (
            <AuthShell
                logo={
                    <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <Mail className="size-6" aria-hidden />
                    </div>
                }
                title="Check your inbox"
                description={`We sent a sign-in link to ${sentTo}.`}
                footer={
                    <Button
                        type="button"
                        variant="link"
                        className="h-auto p-0"
                        onClick={() => {
                            setSentTo(null);
                            form.reset();
                        }}
                    >
                        Use a different email
                    </Button>
                }
            >
                <p className="text-center text-sm text-muted-foreground">
                    The link expires shortly. You can close this tab.
                </p>
            </AuthShell>
        );
    }

    return (
        <AuthShell
            title="Sign in to Bursora"
            description="We'll email you a magic link — no password needed."
            footer={
                <span>
                    New here?{" "}
                    <Button asChild variant="link" className="h-auto p-0">
                        <Link href="/">Learn more</Link>
                    </Button>
                </span>
            }
        >
            <Form {...form}>
                <form
                    onSubmit={form.handleSubmit(onSubmit)}
                    className="flex flex-col gap-4"
                    noValidate
                >
                    <FormField
                        control={form.control}
                        name="email"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Email</FormLabel>
                                <FormControl>
                                    <Input
                                        type="email"
                                        autoComplete="email"
                                        placeholder="you@company.com"
                                        autoFocus
                                        {...field}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <SubmitButton
                        pending={form.formState.isSubmitting}
                        pendingLabel="Sending link…"
                        className="w-full"
                    >
                        Send magic link
                    </SubmitButton>
                </form>
            </Form>
        </AuthShell>
    );
}
