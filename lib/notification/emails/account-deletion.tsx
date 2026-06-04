/**
 * Account-deletion goodbye email.
 *
 * Rendered by `sendAccountDeletionEmail` in `lib/notification/send.ts` when an
 * account enters its deletion grace window. Tells the user the account is
 * suspended, when it purges, and how to keep it (sign back in). The grace
 * window is a fixed 24 hours, so the deadline is phrased relatively — no
 * recipient timezone needed.
 */

import { Cta, EmailLayout, FallbackLink, Heading, Paragraph } from "./layout";

export interface AccountDeletionEmailProps {
    readonly signInUrl: string;
}

export function AccountDeletionEmail({ signInUrl }: AccountDeletionEmailProps) {
    return (
        <EmailLayout preview="Your Bursora account is scheduled for deletion">
            <Heading>Your account is scheduled for deletion</Heading>
            <Paragraph>
                We received a request to delete your Bursora account. It is now suspended and will
                be permanently deleted 24 hours from now, along with the workspaces you alone own
                and their data.
            </Paragraph>
            <Paragraph>
                Changed your mind? Sign back in before then to cancel the deletion and restore your
                account.
            </Paragraph>
            <Cta href={signInUrl} label="Keep my account" />
            <FallbackLink href={signInUrl} />
        </EmailLayout>
    );
}
