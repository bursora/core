/**
 * Workspace invite email.
 *
 * Rendered by `sendInviteEmail` in `lib/notification/send.ts`. Layout,
 * chrome, and footer come from `EmailLayout` so this component only owns
 * the copy, the CTA target, and the expiry/token lines.
 */

import {
    Cta,
    EmailLayout,
    FallbackLink,
    Heading,
    Paragraph,
} from "./layout";

export interface InviteEmailProps {
    readonly acceptUrl: string;
    readonly expiresAt: Date;
    readonly token?: string;
}

export function InviteEmail({ acceptUrl, expiresAt, token }: InviteEmailProps) {
    return (
        <EmailLayout preview="You're invited to a Bursora workspace">
            <Heading>You&apos;re invited to a workspace</Heading>
            <Paragraph>
                A teammate added you to a Bursora workspace. Accept the invite to start tracking
                spend across your AI provider calls.
            </Paragraph>
            <Cta href={acceptUrl} label="Accept invite" />
            <FallbackLink href={acceptUrl} />
            <Paragraph>This link expires {expiresAt.toISOString()}.</Paragraph>
            {token ? <Paragraph>Token: {token}</Paragraph> : null}
        </EmailLayout>
    );
}
