/**
 * Sign-in magic link email.
 *
 * Rendered by `sendMagicLinkEmail` in `lib/notification/send.ts`. Layout,
 * chrome, and footer come from `EmailLayout` so this component only owns
 * the copy and the CTA target.
 */

import { Cta, EmailLayout, FallbackLink, Heading, Paragraph } from "./layout";

export interface MagicLinkEmailProps {
    readonly url: string;
}

export function MagicLinkEmail({ url }: MagicLinkEmailProps) {
    return (
        <EmailLayout preview="Sign in to Bursora">
            <Heading>Sign in to Bursora</Heading>
            <Paragraph>
                Click the button below to sign in. The link will only work for the next few minutes
                — if it expires, request a new one from the sign-in page.
            </Paragraph>
            <Cta href={url} label="Sign in" />
            <FallbackLink href={url} />
            <Paragraph>If you didn&apos;t request this, ignore the email.</Paragraph>
        </EmailLayout>
    );
}
