/**
 * Sign-in one-time code email.
 *
 * Rendered by `sendOtpEmail` in `lib/notification/send.ts`. Layout, chrome,
 * and footer come from `EmailLayout` so this component only owns the copy and
 * the code itself.
 */

import { Section, Text } from "@react-email/components";
import { EmailLayout, Heading, Paragraph } from "./layout";

export interface OtpCodeEmailProps {
    readonly otp: string;
}

export function OtpCodeEmail({ otp }: OtpCodeEmailProps) {
    return (
        <EmailLayout preview="Your Bursora sign-in code">
            <Heading>Sign in to Bursora</Heading>
            <Paragraph>
                Enter this code to finish signing in. It only works for the next few minutes — if it
                expires, request a new one from the sign-in page.
            </Paragraph>
            <Section className="my-7 text-center">
                <Text className="m-0 inline-block rounded-lg border border-solid border-[#e2e8f0] bg-[#f1f5f9] px-7 py-4 pl-[calc(1.75rem+0.45em)] font-mono text-[30px] font-bold leading-none tracking-[0.45em] text-[#0f172a]">
                    {otp}
                </Text>
            </Section>
            <Paragraph>If you didn&apos;t request this, ignore the email.</Paragraph>
        </EmailLayout>
    );
}
