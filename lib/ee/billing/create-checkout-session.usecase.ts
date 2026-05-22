import type { StripeAdapter } from "./types";

export interface CreateCheckoutSessionInput {
    readonly workspaceId: string;
    readonly userEmail: string;
    readonly priceId: string;
    readonly successUrl: string;
    readonly cancelUrl: string;
    readonly stripe: StripeAdapter;
}

export interface CreateCheckoutSessionResult {
    readonly id: string;
    readonly url: string;
}

export async function createCheckoutSessionUseCase(
    input: CreateCheckoutSessionInput,
): Promise<CreateCheckoutSessionResult> {
    const session = await input.stripe.createCheckoutSession({
        workspaceId: input.workspaceId,
        userEmail: input.userEmail,
        priceId: input.priceId,
        successUrl: input.successUrl,
        cancelUrl: input.cancelUrl,
    });
    return { id: session.id, url: session.url };
}
