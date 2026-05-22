/**
 * Notification dispatch — Mailer port + outbound helpers.
 *
 * `Mailer` is the only DI port. `SmtpMailer` is the prod-wired adapter
 * (Mailhog in dev, any SMTP provider in prod). `InMemoryMailer` is the
 * test substitute.
 *
 * `sendMagicLinkEmail` and `sendInviteEmail` are thin renderers over a
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
import { AlertEmail } from "./emails/alert";
import { InviteEmail } from "./emails/invite";
import { MagicLinkEmail } from "./emails/magic-link";
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
    const mailer = new SmtpMailer({ host, port, from: opts?.from ?? DEFAULT_FROM });

    if (opts === undefined) cachedDefaultMailer = mailer;
    return mailer;
}

export interface SendMagicLinkInput {
    readonly mailer: Mailer;
    readonly email: string;
    readonly url: string;
}

export async function sendMagicLinkEmail(input: SendMagicLinkInput): Promise<void> {
    const node = MagicLinkEmail({ url: input.url });
    const [html, text] = await Promise.all([render(node), render(node, { plainText: true })]);
    await input.mailer.send({
        to: input.email,
        subject: "Sign in to Bursora",
        html,
        text,
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
    const node = InviteEmail(
        input.token !== undefined
            ? { acceptUrl: input.acceptUrl, expiresAt: input.expiresAt, token: input.token }
            : { acceptUrl: input.acceptUrl, expiresAt: input.expiresAt },
    );
    const [html, text] = await Promise.all([render(node), render(node, { plainText: true })]);
    await input.mailer.send({
        to: input.email,
        subject: "You're invited to a Bursora workspace",
        html,
        text,
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
    const node = AlertEmail({ event: input.event, renderOptions });
    const [html, text] = await Promise.all([render(node), render(node, { plainText: true })]);
    const { subject } = renderEmailPayload(input.event, renderOptions);
    await input.mailer.send({
        to: input.email,
        subject,
        html,
        text,
    });
}

export type { AlertChannel, AlertChannelKind } from "./alert-channel";
export type { AlertChannelRepository } from "./alert-channel.repository";
export { dispatchAlertHandler } from "./dispatch-alert.handler";
export type { DispatchAlertDeps, DispatchAlertHandler } from "./dispatch-alert.handler";
export { renderWebhookPayload } from "./webhook-payload";
export type { WebhookPayload } from "./webhook-payload";
export type { WebhookSender } from "./webhook-sender";
