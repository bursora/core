"use client";

/**
 * Alert channels form. Slack + Discord webhook URLs + alert email.
 *
 * Each channel is a toggle row (shadcn Switch inside FormField) plus a
 * conditionally-revealed URL/address input. Toggling off blanks the input
 * on submit. Email pre-fills with the signed-in user's address. Server
 * use case re-validates; client validation runs on blur.
 */

import {
    PULSE_DURATION_MS,
    pulseClass,
    shouldPulse,
    type PulseState,
} from "@/app/(dashboard)/workspace/[workspaceId]/settings/_lib/pulse-feedback";
import { saveAlertChannelsAction } from "@/app/(dashboard)/workspace/[workspaceId]/settings/actions";
import {
    DISCORD_HINT,
    EMAIL_HINT,
    SLACK_HINT,
    isValidAlertEmail,
    isValidDiscordUrl,
    isValidSlackUrl,
} from "@/app/(dashboard)/workspace/[workspaceId]/settings/validation";
import { DiscordLogo } from "@/components/ui/brand/discord-logo";
import { SlackLogo } from "@/components/ui/brand/slack-logo";
import { Button } from "@/components/ui/button";
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { useInflight } from "@/components/ui/hooks/use-inflight";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { zodResolver } from "@hookform/resolvers/zod";
import { Mail } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const schema = z
    .object({
        slackEnabled: z.boolean(),
        slackUrl: z.string().refine(isValidSlackUrl, { message: SLACK_HINT }),
        discordEnabled: z.boolean(),
        discordUrl: z.string().refine(isValidDiscordUrl, { message: DISCORD_HINT }),
        emailEnabled: z.boolean(),
        emailAddress: z.string().refine(isValidAlertEmail, { message: EMAIL_HINT }),
    })
    .superRefine((values, ctx) => {
        if (values.slackEnabled && values.slackUrl.length === 0) {
            ctx.addIssue({
                code: "custom",
                path: ["slackUrl"],
                message: "Slack webhook URL is required.",
            });
        }
        if (values.discordEnabled && values.discordUrl.length === 0) {
            ctx.addIssue({
                code: "custom",
                path: ["discordUrl"],
                message: "Discord webhook URL is required.",
            });
        }
        if (values.emailEnabled && values.emailAddress.length === 0) {
            ctx.addIssue({
                code: "custom",
                path: ["emailAddress"],
                message: "Email address is required.",
            });
        }
    });

type FormValues = z.infer<typeof schema>;

interface AlertChannelsFormProps {
    workspaceId: string;
    slackUrl: string;
    discordUrl: string;
    emailAddress: string;
    userEmail: string;
}

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export function AlertChannelsForm({
    workspaceId,
    slackUrl,
    discordUrl,
    emailAddress,
    userEmail,
}: AlertChannelsFormProps) {
    const [isPending, startTransition] = useTransition();
    const [pulse, setPulse] = useState<PulseState>("idle");
    const pulseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const form = useForm<FormValues>({
        resolver: zodResolver(schema),
        mode: "onBlur",
        defaultValues: {
            slackEnabled: slackUrl.length > 0,
            slackUrl,
            discordEnabled: discordUrl.length > 0,
            discordUrl,
            emailEnabled: emailAddress.length > 0,
            emailAddress: emailAddress.length > 0 ? emailAddress : userEmail,
        },
    });

    const slackEnabled = useWatch({ control: form.control, name: "slackEnabled" });
    const discordEnabled = useWatch({ control: form.control, name: "discordEnabled" });
    const emailEnabled = useWatch({ control: form.control, name: "emailEnabled" });

    useEffect(() => {
        return () => {
            if (pulseTimer.current) clearTimeout(pulseTimer.current);
        };
    }, []);

    const flashPulse = (next: PulseState) => {
        const reduced =
            typeof window !== "undefined" &&
            typeof window.matchMedia === "function" &&
            window.matchMedia(REDUCED_MOTION_QUERY).matches;
        if (!shouldPulse(reduced)) return;
        setPulse(next);
        if (pulseTimer.current) clearTimeout(pulseTimer.current);
        pulseTimer.current = setTimeout(() => {
            setPulse("idle");
        }, PULSE_DURATION_MS);
    };

    // useInflight drops a second submit while the first is still saving; the
    // transition keeps the button's pending state in sync with that request.
    const submit = useInflight(async (values: FormValues) => {
        const fd = new FormData();
        fd.set("workspaceId", workspaceId);
        fd.set("slackUrl", values.slackEnabled ? values.slackUrl : "");
        fd.set("discordUrl", values.discordEnabled ? values.discordUrl : "");
        fd.set("emailAddress", values.emailEnabled ? values.emailAddress : "");

        const result = await saveAlertChannelsAction(fd);
        if (result.ok) {
            flashPulse("success");
            toast.success("Channels saved");
            return;
        }
        flashPulse("error");
        toast.error(result.error ?? "Failed to save channels.");
    });
    const onSubmit = (values: FormValues) => {
        startTransition(() => submit(values));
    };

    return (
        <Form {...form}>
            <form
                onSubmit={(e) => void form.handleSubmit(onSubmit)(e)}
                className={`space-y-4 rounded-md border-2 border-transparent transition-colors duration-300 ${pulseClass(pulse)}`}
                noValidate
                data-pulse={pulse}
            >
                <div className="rounded-lg border">
                    <FormField
                        control={form.control}
                        name="slackEnabled"
                        render={({ field }) => (
                            <FormItem className="flex flex-row items-center justify-between p-4">
                                <div className="flex items-center gap-3">
                                    <SlackLogo className="size-5 shrink-0" />
                                    <div className="space-y-0.5">
                                        <FormLabel className="text-base">Slack</FormLabel>
                                        <FormDescription>
                                            Post alerts to a Slack channel via incoming webhook.
                                        </FormDescription>
                                    </div>
                                </div>
                                <FormControl>
                                    <Switch
                                        checked={field.value}
                                        onCheckedChange={field.onChange}
                                        aria-label="Toggle Slack alerts"
                                    />
                                </FormControl>
                            </FormItem>
                        )}
                    />
                    {slackEnabled ? (
                        <div className="border-t p-4">
                            <FormField
                                control={form.control}
                                name="slackUrl"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Slack webhook URL</FormLabel>
                                        <FormControl>
                                            <Input
                                                type="url"
                                                inputMode="url"
                                                autoComplete="off"
                                                placeholder="https://hooks.slack.com/services/..."
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormDescription>{SLACK_HINT}</FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>
                    ) : null}
                </div>

                <div className="rounded-lg border">
                    <FormField
                        control={form.control}
                        name="discordEnabled"
                        render={({ field }) => (
                            <FormItem className="flex flex-row items-center justify-between p-4">
                                <div className="flex items-center gap-3">
                                    <DiscordLogo className="size-5 shrink-0" />
                                    <div className="space-y-0.5">
                                        <FormLabel className="text-base">Discord</FormLabel>
                                        <FormDescription>
                                            Post alerts to a Discord channel via webhook.
                                        </FormDescription>
                                    </div>
                                </div>
                                <FormControl>
                                    <Switch
                                        checked={field.value}
                                        onCheckedChange={field.onChange}
                                        aria-label="Toggle Discord alerts"
                                    />
                                </FormControl>
                            </FormItem>
                        )}
                    />
                    {discordEnabled ? (
                        <div className="border-t p-4">
                            <FormField
                                control={form.control}
                                name="discordUrl"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Discord webhook URL</FormLabel>
                                        <FormControl>
                                            <Input
                                                type="url"
                                                inputMode="url"
                                                autoComplete="off"
                                                placeholder="https://discord.com/api/webhooks/..."
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormDescription>{DISCORD_HINT}</FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>
                    ) : null}
                </div>

                <div className="rounded-lg border">
                    <FormField
                        control={form.control}
                        name="emailEnabled"
                        render={({ field }) => (
                            <FormItem className="flex flex-row items-center justify-between p-4">
                                <div className="flex items-center gap-3">
                                    <Mail className="size-5 shrink-0 text-muted-foreground" />
                                    <div className="space-y-0.5">
                                        <FormLabel className="text-base">Email</FormLabel>
                                        <FormDescription>
                                            Send alerts to an email address.
                                        </FormDescription>
                                    </div>
                                </div>
                                <FormControl>
                                    <Switch
                                        checked={field.value}
                                        onCheckedChange={field.onChange}
                                        aria-label="Toggle email alerts"
                                    />
                                </FormControl>
                            </FormItem>
                        )}
                    />
                    {emailEnabled ? (
                        <div className="border-t p-4">
                            <FormField
                                control={form.control}
                                name="emailAddress"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Send alerts to</FormLabel>
                                        <FormControl>
                                            <Input
                                                type="email"
                                                inputMode="email"
                                                autoComplete="email"
                                                placeholder={userEmail}
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormDescription>{EMAIL_HINT}</FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>
                    ) : null}
                </div>

                <Button type="submit" disabled={isPending}>
                    {isPending ? "Saving…" : "Save channels"}
                </Button>
            </form>
        </Form>
    );
}
