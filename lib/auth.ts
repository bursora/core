/**
 * Better-auth instance.
 *
 * Two sign-in flows: email code (OTP) and Google OAuth. One-time codes are
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
import { USER_ROLE } from "@/lib/identity/user-role";
import { defaultSmtpMailer, sendOtpEmail } from "@/lib/notification";
import * as Sentry from "@sentry/nextjs";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { emailOTP } from "better-auth/plugins";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

/**
 * Lazily-constructed better-auth instance. Deferred behind a function so
 * `next build` — which imports every route module — never reads env before the
 * real secrets exist. The first call at request time builds and memoizes it.
 */
function buildAuth() {
    const mailer = defaultSmtpMailer();
    return betterAuth({
        baseURL: env().BETTER_AUTH_URL,
        secret: env().BETTER_AUTH_SECRET,
        trustedOrigins: [...env().BETTER_AUTH_TRUSTED_ORIGINS],
        database: drizzleAdapter(db(), { provider: "pg", schema }),
        advanced: { database: { generateId: "uuid" } },
        user: {
            modelName: "users",
            additionalFields: {
                // Global platform role surfaced on the session user object.
                // `input: false` makes it non-writable from any client input
                // (signup, profile update, or any API), so only server-side code
                // can ever change it. Per-workspace roles live separately on
                // workspace_members.role.
                role: {
                    type: "string",
                    required: false,
                    defaultValue: USER_ROLE.user,
                    input: false,
                },
            },
        },
        emailAndPassword: { enabled: false },
        socialProviders: {
            google: {
                clientId: env().GOOGLE_CLIENT_ID,
                clientSecret: env().GOOGLE_CLIENT_SECRET,
            },
        },
        databaseHooks: {
            session: {
                create: {
                    // Signing in is how a user reverts a pending account
                    // deletion within the grace window: clear the flag and
                    // un-suspend their keys. No-op for active accounts.
                    // Dynamic import keeps the identity composition graph out
                    // of the auth module's load path.
                    after: async (session) => {
                        // Best-effort: a failure here must never block sign-in,
                        // which is the very action that should restore the account.
                        try {
                            const { reactivateAccount } = await import("./identity/server");
                            const reactivated = await reactivateAccount({
                                userId: session.userId,
                            });
                            if (reactivated) {
                                // Surface a welcome-back toast on the next dashboard
                                // render. Short-lived; the client reads it once and
                                // clears it.
                                const { cookies } = await import("next/headers");
                                (await cookies()).set("bursora-reactivated", "1", {
                                    maxAge: 120,
                                    path: "/",
                                });
                            }
                        } catch (err: unknown) {
                            Sentry.captureException(err, {
                                tags: { area: "account-deletion", step: "reactivate-hook" },
                                extra: { userId: session.userId },
                            });
                        }
                    },
                },
            },
        },
        plugins: [
            emailOTP({
                sendVerificationOTP: async ({ email, otp }) => {
                    await sendOtpEmail({ mailer, email, otp });
                },
            }),
            nextCookies(),
        ],
    });
}

type AuthInstance = ReturnType<typeof buildAuth>;

let authInstance: AuthInstance | null = null;

export function getAuth(): AuthInstance {
    return (authInstance ??= buildAuth());
}

export type Session = AuthInstance["$Infer"]["Session"];

/**
 * Per-request cached session lookup. Wrapping in React's `cache` so multiple
 * server components in the same render share a single `auth.api.getSession`
 * call instead of hitting the auth backend per page + layout.
 */
export const getRequestSession = cache(async () => {
    // Resolve headers first: during a build-time prerender this hits Next's
    // dynamic bailout before getAuth() touches env, so auth-gated pages render
    // dynamically instead of erroring on the (runtime-only) env.
    const requestHeaders = await headers();
    return getAuth().api.getSession({ headers: requestHeaders });
});

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
