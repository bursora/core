"use client";

import { AuthShell } from "@/components/shell/auth-shell";
import { GoogleIcon } from "@/components/ui/brand/google-icon";
import { Button } from "@/components/ui/button";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { useInflight } from "@/components/ui/hooks/use-inflight";
import { Input } from "@/components/ui/input";
import {
    InputOTP,
    InputOTPGroup,
    InputOTPSeparator,
    InputOTPSlot,
} from "@/components/ui/input-otp";
import { Separator } from "@/components/ui/separator";
import { SubmitButton } from "@/components/ui/submit-button";
import { authClient } from "@/lib/auth-client";
import { emailSchema } from "@/lib/email";
import { zodResolver } from "@hookform/resolvers/zod";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { Loader2, Mail } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const LOGIN_CALLBACK_URL = "/workspace";

const emailFormSchema = z.object({
    email: emailSchema,
});

const codeFormSchema = z.object({
    code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code"),
});

type EmailValues = z.infer<typeof emailFormSchema>;
type CodeValues = z.infer<typeof codeFormSchema>;

interface LoginFormProps {
    /** Render the Google sign-in button. False when the OAuth pair is unset. */
    googleEnabled: boolean;
}

export function LoginForm({ googleEnabled }: LoginFormProps) {
    const [sentTo, setSentTo] = useState<string | null>(null);
    const [googlePending, setGooglePending] = useState(false);
    const [redirecting, setRedirecting] = useState(false);
    const emailForm = useForm<EmailValues>({
        resolver: zodResolver(emailFormSchema),
        defaultValues: { email: "" },
    });
    const codeForm = useForm<CodeValues>({
        resolver: zodResolver(codeFormSchema),
        defaultValues: { code: "" },
    });

    const onRequestCode = async (values: EmailValues) => {
        const result = await authClient.emailOtp.sendVerificationOtp({
            email: values.email,
            type: "sign-in",
        });
        if (result.error) {
            const message = result.error.message ?? "Failed to send code";
            emailForm.setError("email", { message });
            toast.error(message);
            return;
        }
        setSentTo(values.email);
    };

    const onVerifyCode = async (values: CodeValues) => {
        if (!sentTo) return;
        const result = await authClient.signIn.emailOtp({
            email: sentTo,
            otp: values.code,
        });
        if (result.error) {
            const message = result.error.message ?? "Invalid or expired code";
            codeForm.setError("code", { message });
            toast.error(message);
            return;
        }
        // Keep the button in its pending state through the redirect — the
        // navigation below is async, so without this the spinner clears and
        // the button is clickable again in the gap before the page unloads.
        setRedirecting(true);
        window.location.assign(LOGIN_CALLBACK_URL);
    };

    const onGoogle = async () => {
        setGooglePending(true);
        const result = await authClient.signIn.social({
            provider: "google",
            callbackURL: LOGIN_CALLBACK_URL,
        });
        if (result.error) {
            toast.error(result.error.message ?? "Failed to sign in with Google");
            setGooglePending(false);
        }
    };

    // Guard each submit so a second trigger is dropped while the first request
    // is in flight — e.g. OTP paste-to-autosubmit racing an Enter keypress.
    const requestCode = useInflight(onRequestCode);
    const verifyCode = useInflight(onVerifyCode);
    const signInWithGoogle = useInflight(onGoogle);

    if (sentTo) {
        return (
            <AuthShell
                logo={
                    <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <Mail className="size-6" aria-hidden />
                    </div>
                }
                title="Enter your code"
                description={`We sent a 6-digit code to ${sentTo}.`}
                footer={
                    <Button
                        type="button"
                        variant="link"
                        className="h-auto p-0"
                        onClick={() => {
                            setSentTo(null);
                            codeForm.reset();
                            emailForm.reset();
                        }}
                    >
                        Use a different email
                    </Button>
                }
            >
                <Form {...codeForm}>
                    <form
                        onSubmit={codeForm.handleSubmit(verifyCode)}
                        className="flex flex-col gap-4"
                        noValidate
                    >
                        <FormField
                            control={codeForm.control}
                            name="code"
                            render={({ field }) => (
                                <FormItem className="flex flex-col items-center">
                                    <FormLabel className="sr-only">Sign-in code</FormLabel>
                                    <FormControl>
                                        <InputOTP
                                            maxLength={6}
                                            autoFocus
                                            inputMode="numeric"
                                            pattern={REGEXP_ONLY_DIGITS}
                                            value={field.value}
                                            onChange={field.onChange}
                                            onComplete={codeForm.handleSubmit(verifyCode)}
                                        >
                                            <InputOTPGroup>
                                                <InputOTPSlot index={0} />
                                                <InputOTPSlot index={1} />
                                                <InputOTPSlot index={2} />
                                            </InputOTPGroup>
                                            <InputOTPSeparator />
                                            <InputOTPGroup>
                                                <InputOTPSlot index={3} />
                                                <InputOTPSlot index={4} />
                                                <InputOTPSlot index={5} />
                                            </InputOTPGroup>
                                        </InputOTP>
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <SubmitButton
                            pending={codeForm.formState.isSubmitting || redirecting}
                            pendingLabel={redirecting ? "Signing in…" : "Verifying…"}
                            className="w-full"
                        >
                            Sign in
                        </SubmitButton>
                    </form>
                </Form>
            </AuthShell>
        );
    }

    return (
        <AuthShell
            title="Sign in to Bursora"
            description="We'll email you a sign-in code — no password needed."
            footer={
                <span>
                    New here?{" "}
                    <Button asChild variant="link" className="h-auto p-0">
                        <Link href="/">Learn more</Link>
                    </Button>
                </span>
            }
        >
            <div className="flex flex-col gap-4">
                {googleEnabled && (
                    <>
                        <Button
                            type="button"
                            variant="outline"
                            className="w-full"
                            onClick={signInWithGoogle}
                            disabled={googlePending}
                        >
                            {googlePending ? (
                                <Loader2 className="animate-spin" aria-hidden />
                            ) : (
                                <GoogleIcon />
                            )}
                            {googlePending ? "Redirecting…" : "Continue with Google"}
                        </Button>
                        <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-muted-foreground">
                            <Separator className="flex-1" />
                            <span>or</span>
                            <Separator className="flex-1" />
                        </div>
                    </>
                )}
                <Form {...emailForm}>
                    <form
                        onSubmit={emailForm.handleSubmit(requestCode)}
                        className="flex flex-col gap-4"
                        noValidate
                    >
                        <FormField
                            control={emailForm.control}
                            name="email"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Email</FormLabel>
                                    <FormControl>
                                        <Input
                                            type="email"
                                            autoComplete="email"
                                            className="ph-no-capture"
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
                            pending={emailForm.formState.isSubmitting}
                            pendingLabel="Sending code…"
                            className="w-full"
                        >
                            Send code
                        </SubmitButton>
                    </form>
                </Form>
            </div>
        </AuthShell>
    );
}
