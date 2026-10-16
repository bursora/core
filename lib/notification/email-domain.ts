import "server-only";

import { Resolver } from "node:dns/promises";

export class EmailDomainError extends Error {
    constructor() {
        super("This email domain cannot receive mail. Check the address.");
        this.name = "EmailDomainError";
    }
}

/** Reject only explicit DNS evidence; this does not verify mailbox existence. */
export async function assertEmailDomainAcceptsMail(email: string): Promise<void> {
    const domain = email.slice(email.lastIndexOf("@") + 1).toLowerCase();
    const resolver = new Resolver({ timeout: 1000, tries: 1 });
    let records;
    try {
        records = await resolver.resolveMx(domain);
    } catch (error: unknown) {
        if (error instanceof Error && "code" in error && error.code === "ENOTFOUND") {
            throw new EmailDomainError();
        }
        // No MX is not proof: SMTP can fall back to A/AAAA. DNS outages and
        // timeouts must also leave delivery to the relay, not reject a real user.
        return;
    }
    // RFC 7505 null MX is one record with preference 0 and the root exchange.
    // Node represents the root as ""; accept "." too. Mixed records are uncertain.
    const record = records[0];
    if (
        records.length === 1 &&
        record?.priority === 0 &&
        (record.exchange === "" || record.exchange === ".")
    ) {
        throw new EmailDomainError();
    }
}
