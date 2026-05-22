/**
 * Shared transactional email layout.
 *
 * Every Bursora email renders through `EmailLayout`. It provides the
 * preview text, brand header, body container, CTA button, and footer.
 * Individual email components (`MagicLinkEmail`, `InviteEmail`, …) only
 * declare their copy and the CTA target — never their own chrome.
 */

import {
    Body,
    Button,
    Container,
    Head,
    Hr,
    Html,
    Link,
    Preview,
    Section,
    Tailwind,
    Text,
} from "@react-email/components";
import type { ReactNode } from "react";

export interface EmailLayoutProps {
    readonly preview: string;
    readonly children: ReactNode;
}

export function EmailLayout({ preview, children }: EmailLayoutProps) {
    return (
        <Html>
            <Head />
            <Preview>{preview}</Preview>
            <Tailwind>
                <Body className="bg-[#f6f7f9] font-sans">
                    <Container className="mx-auto my-10 max-w-[520px] rounded-lg border border-solid border-[#e4e7eb] bg-white p-8">
                        <Section className="pb-6">
                            <Text className="m-0 text-[18px] font-semibold tracking-tight text-[#0f172a]">
                                Bursora
                            </Text>
                        </Section>
                        <Section>{children}</Section>
                        <Hr className="my-6 border-[#e4e7eb]" />
                        <Section>
                            <Text className="m-0 text-[12px] leading-5 text-[#64748b]">
                                Cost control for teams building on AI providers. If you weren&apos;t
                                expecting this email, you can ignore it safely.
                            </Text>
                            <Text className="m-0 mt-2 text-[12px] leading-5 text-[#64748b]">
                                <Link
                                    href="https://bursora.dev"
                                    className="text-[#64748b] underline"
                                >
                                    bursora.dev
                                </Link>
                            </Text>
                        </Section>
                    </Container>
                </Body>
            </Tailwind>
        </Html>
    );
}

export interface CtaProps {
    readonly href: string;
    readonly label: string;
}

export function Cta({ href, label }: CtaProps) {
    return (
        <Section className="my-6">
            <Button
                href={href}
                className="rounded-md bg-[#0f172a] px-5 py-3 text-[14px] font-medium text-white no-underline"
            >
                {label}
            </Button>
        </Section>
    );
}

export interface HeadingProps {
    readonly children: ReactNode;
}

export function Heading({ children }: HeadingProps) {
    return (
        <Text className="m-0 text-[22px] font-semibold tracking-tight text-[#0f172a]">
            {children}
        </Text>
    );
}

export interface ParagraphProps {
    readonly children: ReactNode;
}

export function Paragraph({ children }: ParagraphProps) {
    return <Text className="m-0 mt-4 text-[14px] leading-6 text-[#334155]">{children}</Text>;
}

export interface FallbackLinkProps {
    readonly href: string;
}

export function FallbackLink({ href }: FallbackLinkProps) {
    return (
        <Text className="m-0 mt-4 text-[12px] leading-5 text-[#64748b]">
            Or paste this URL into your browser:{" "}
            <Link href={href} className="break-all text-[#0f172a] underline">
                {href}
            </Link>
        </Text>
    );
}
