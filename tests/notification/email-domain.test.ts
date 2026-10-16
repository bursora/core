import { EmailDomainError } from "@/lib/notification/email-domain";
import { SmtpMailer } from "@/lib/notification/send";
import { afterEach, expect, spyOn, test } from "bun:test";
import { Resolver } from "node:dns/promises";
import nodemailer from "nodemailer";

// JSON transport captures the handoff without ever sending an email.
const transport = nodemailer.createTransport({ jsonTransport: true });
let mx = spyOn(Resolver.prototype, "resolveMx");
let createTransport = spyOn(nodemailer, "createTransport");
let send = spyOn(transport, "sendMail");
afterEach(() => {
    mx.mockRestore();
    createTransport.mockRestore();
    send.mockRestore();
});

function mailer(checkRecipientDomain = true) {
    mx = spyOn(Resolver.prototype, "resolveMx");
    createTransport = spyOn(nodemailer, "createTransport").mockReturnValue(transport);
    send = spyOn(transport, "sendMail");
    return new SmtpMailer({
        host: "localhost",
        port: 1025,
        from: "sender@example.com",
        checkRecipientDomain,
    });
}

const message = { to: "person@Example.com", subject: "Test", text: "Test" };

test("NXDOMAIN stops the SMTP handoff", async () => {
    const smtp = mailer();
    mx.mockRejectedValue(Object.assign(new Error("not found"), { code: "ENOTFOUND" }));
    await expect(smtp.send(message)).rejects.toBeInstanceOf(EmailDomainError);
    expect(send).not.toHaveBeenCalled();
    expect(mx).toHaveBeenCalledWith("example.com");
});

test.each(["", "."])("explicit null MX (%p) stops the SMTP handoff", async (exchange) => {
    const smtp = mailer();
    mx.mockResolvedValue([{ priority: 0, exchange }]);
    await expect(smtp.send(message)).rejects.toBeInstanceOf(EmailDomainError);
    expect(send).not.toHaveBeenCalled();
});

test.each(["ENODATA", "ETIMEOUT", "ESERVFAIL", "EREFUSED", "ECONNREFUSED"])(
    "%s leaves delivery to SMTP instead of rejecting the recipient",
    async (code) => {
        const smtp = mailer();
        mx.mockRejectedValue(Object.assign(new Error(code), { code }));
        await smtp.send(message);
        expect(send).toHaveBeenCalledTimes(1);
    },
);

test.each([
    { records: [{ priority: 10, exchange: "mx.example.com" }] },
    { records: [] },
    {
        records: [
            { priority: 0, exchange: "" },
            { priority: 10, exchange: "mx.example.com" },
        ],
    },
])("ordinary or inconclusive MX answers allow sending (%p)", async ({ records }) => {
    const smtp = mailer();
    mx.mockResolvedValue([...records]);
    await smtp.send(message);
    expect(send).toHaveBeenCalledTimes(1);
});

test("self-host and local mail catchers can skip public-domain validation", async () => {
    const smtp = mailer(false);
    await smtp.send({ ...message, to: "person@internal.test" });
    expect(mx).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(1);
});
