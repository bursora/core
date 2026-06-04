/**
 * Notification dispatch — Mailer port + outbound helpers.
 *
 * `Mailer` is the only DI port. `SmtpMailer` is the prod-wired adapter
 * (Mailhog in dev, any SMTP provider in prod). `InMemoryMailer` is the
 * test substitute.
 *
 * `sendOtpEmail` and `sendInviteEmail` are thin renderers over a
 * `Mailer` so callers (`lib/auth.ts`, identity invites) share the same
 * subject/body conventions.
 *
 * Webhook alert dispatch (Slack/Discord) is delegated to the existing
 * `dispatchAlertHandler` re-exported here.
 */

import { render } from "@react-email/render";
import nodemailer, { type Transporter } from "nodemailer";
import "server-only";

import { env } from "../env";
import type { AlertRaisedEvent } from "../event-bus";
import { formatRelativeTime } from "../format";
import { AccountDeletionEmail } from "./emails/account-deletion";
import { AlertEmail } from "./emails/alert";
import { InviteEmail } from "./emails/invite";
import { OtpCodeEmail } from "./emails/otp-code";
import { renderEmailPayload, type RenderOptions } from "./webhook-payload";

/**
 * Outbound mail port. Notification owns transactional email; other
 * callers depend on the `Mailer` interface type-only and receive an
 * instance from the wiring module.
 */
export interface MailMessage {
    readonly to: string;
    readonly subject: string;
    readonly text: string;
    readonly html?: string;
}

export interface Mailer {
    send(message: MailMessage): Promise<void>;
}

export interface SmtpMailerConfig {
    readonly host: string;
    readonly port: number;
    readonly from: string;
    readonly user?: string;
    readonly pass?: string;
}

/**
 * Nodemailer-backed mailer. In dev this is wired to the host Mailhog
 * container (localhost:1025) which captures every message in its UI at
 * :8100. In production the same adapter accepts any SMTP provider — host,
 * port, and credentials are injected at boot.
 */
export class SmtpMailer implements Mailer {
    private readonly transporter: Transporter;
    private readonly from: string;

    constructor(config: SmtpMailerConfig) {
        const auth =
            config.user !== undefined && config.pass !== undefined
                ? { user: config.user, pass: config.pass }
                : undefined;
        this.transporter = nodemailer.createTransport({
            host: config.host,
            port: config.port,
            secure: false,
            ...(auth ? { auth } : {}),
        });
        this.from = config.from;
    }

    async send(message: MailMessage): Promise<void> {
        await this.transporter.sendMail({
            from: this.from,
            to: message.to,
            subject: message.subject,
            text: message.text,
            ...(message.html ? { html: message.html } : {}),
        });
    }
}

export class InMemoryMailer implements Mailer {
    readonly messages: MailMessage[] = [];

    async send(message: MailMessage): Promise<void> {
        this.messages.push(message);
    }
}

const DEFAULT_FROM = "Bursora <hello@bursora.com>";

let cachedDefaultMailer: SmtpMailer | null = null;

/**
 * Process-wide SMTP mailer wired from `SMTP_HOST` + `SMTP_PORT`. Cached
 * after first construction so callers (auth, identity, alert dispatch)
 * share the same transporter and the `from` header stays consistent.
 *
 * `envProvider` and `from` are escape hatches for tests; production
 * callers pass nothing.
 */
export function defaultSmtpMailer(opts?: {
    readonly host?: string;
    readonly port?: number;
    readonly from?: string;
}): SmtpMailer {
    if (cachedDefaultMailer && opts === undefined) return cachedDefaultMailer;

    // Env resolves lazily, so test runs that never construct the mailer
    // don't need SMTP_HOST / SMTP_PORT set.
    const host = opts?.host ?? env().SMTP_HOST;
    const port = opts?.port ?? env().SMTP_PORT;
    const user = env().SMTP_USER;
    const pass = env().SMTP_PASS;
    const mailer = new SmtpMailer({
        host,
        port,
        from: opts?.from ?? DEFAULT_FROM,
        ...(user.length > 0 && pass.length > 0 ? { user, pass } : {}),
    });

    if (opts === undefined) cachedDefaultMailer = mailer;
    return mailer;
}

/** Render an email node to HTML + plain text and hand it to the mailer. */
async function renderAndSend(input: {
    readonly mailer: Mailer;
    readonly to: string;
    readonly subject: string;
    readonly node: Parameters<typeof render>[0];
}): Promise<void> {
    const [html, text] = await Promise.all([
        render(input.node),
        render(input.node, { plainText: true }),
    ]);
    await input.mailer.send({ to: input.to, subject: input.subject, html, text });
}

export interface SendOtpInput {
    readonly mailer: Mailer;
    readonly email: string;
    readonly otp: string;
}

export async function sendOtpEmail(input: SendOtpInput): Promise<void> {
    await renderAndSend({
        mailer: input.mailer,
        to: input.email,
        subject: "Your Bursora sign-in code",
        node: OtpCodeEmail({ otp: input.otp }),
    });
}

export interface SendInviteInput {
    readonly mailer: Mailer;
    readonly email: string;
    readonly acceptUrl: string;
    readonly expiresAt: Date;
    readonly token?: string;
}

export async function sendInviteEmail(input: SendInviteInput): Promise<void> {
    // The recipient's zone is unknown (they may have no account yet), so the
    // expiry is relative ("in 1 day") rather than an absolute local time.
    const expiresIn = formatRelativeTime(input.expiresAt);
    const node = InviteEmail(
        input.token !== undefined
            ? { acceptUrl: input.acceptUrl, expiresIn, token: input.token }
            : { acceptUrl: input.acceptUrl, expiresIn },
    );
    await renderAndSend({
        mailer: input.mailer,
        to: input.email,
        subject: "You're invited to a Bursora workspace",
        node,
    });
}

export interface SendAccountDeletionInput {
    readonly mailer: Mailer;
    readonly email: string;
    readonly signInUrl: string;
}

export async function sendAccountDeletionEmail(input: SendAccountDeletionInput): Promise<void> {
    await renderAndSend({
        mailer: input.mailer,
        to: input.email,
        subject: "Your Bursora account is scheduled for deletion",
        node: AccountDeletionEmail({ signInUrl: input.signInUrl }),
    });
}

export interface SendAlertInput {
    readonly mailer: Mailer;
    readonly email: string;
    readonly event: AlertRaisedEvent;
    readonly renderOptions?: RenderOptions;
}

export async function sendAlertEmail(input: SendAlertInput): Promise<void> {
    const renderOptions = input.renderOptions ?? {};
    const { subject } = renderEmailPayload(input.event, renderOptions);
    await renderAndSend({
        mailer: input.mailer,
        to: input.email,
        subject,
        node: AlertEmail({ event: input.event, renderOptions }),
    });
}

export type { AlertChannel, AlertChannelKind } from "./alert-channel";
export type { AlertChannelRepository } from "./alert-channel.repository";
export { dispatchAlertHandler } from "./dispatch-alert.handler";
export type { DispatchAlertDeps, DispatchAlertHandler } from "./dispatch-alert.handler";
export { renderWebhookPayload } from "./webhook-payload";
export type { WebhookPayload } from "./webhook-payload";
export type { WebhookSender } from "./webhook-sender";
