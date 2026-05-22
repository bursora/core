import type { MailMessage, Mailer } from "@/lib/notification";

export class CapturingMailer implements Mailer {
    readonly messages: MailMessage[] = [];

    async send(message: MailMessage): Promise<void> {
        this.messages.push(message);
    }
}
