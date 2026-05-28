/**
 * Better-auth instance.
 *
 * Two sign-in flows: magic link and Google OAuth. Magic-link tokens are
 * mailed via the same SMTP-backed `Mailer` we use for invites; in dev that's
 * Mailhog at `localhost:1025`. Google OAuth lands the user on `/workspace`
 * after consent. No password.
 *
 * Better-auth owns `users`, `session`, `account`, and `verification`. The
 * `users` table (renamed from better-auth's default `user` via `modelName`)
 * is the single source of truth — domain FKs (workspace_members,
 * workspace_invites) reference it directly.
 */

import "server-only";

import { db, schema } from "@/lib/db";
import { env } from "@/lib/env";
import { defaultSmtpMailer, sendMagicLinkEmail } from "@/lib/notification";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

const mailer = defaultSmtpMailer();

export const auth = betterAuth({
    baseURL: env().BETTER_AUTH_URL,
    secret: env().BETTER_AUTH_SECRET,
    trustedOrigins: [...env().BETTER_AUTH_TRUSTED_ORIGINS],
    database: drizzleAdapter(db(), { provider: "pg", schema }),
    advanced: { database: { generateId: "uuid" } },
    user: { modelName: "users" },
    emailAndPassword: { enabled: false },
    socialProviders: {
        google: {
            clientId: env().GOOGLE_CLIENT_ID,
            clientSecret: env().GOOGLE_CLIENT_SECRET,
        },
    },
    plugins: [
        magicLink({
            sendMagicLink: async ({ email, url }) => {
                await sendMagicLinkEmail({ mailer, email, url });
            },
        }),
        nextCookies(),
    ],
});

export type Session = typeof auth.$Infer.Session;

/**
 * Per-request cached session lookup. Wrapping in React's `cache` so multiple
 * server components in the same render share a single `auth.api.getSession`
 * call instead of hitting the auth backend per page + layout.
 */
export const getRequestSession = cache(async () =>
    auth.api.getSession({ headers: await headers() }),
);

/**
 * Same as `getRequestSession` but redirects to `/login` when the user is
 * unauthenticated, narrowing the return type for callers that already sit
 * behind the dashboard layout (which redirects on null).
 */
export const requireSessionUI = cache(async () => {
    const session = await getRequestSession();
    if (!session) redirect("/login");
    return session;
});
