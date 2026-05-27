import type { PaymentProviderAdapter } from "./types";

export interface CreateCheckoutSessionInput {
    readonly workspaceId: string;
    readonly userEmail: string;
    readonly variantId: string;
    readonly successUrl: string;
    readonly cancelUrl: string;
    readonly provider: PaymentProviderAdapter;
}

export interface CreateCheckoutSessionResult {
    readonly id: string;
    readonly url: string;
}

export async function createCheckoutSessionUseCase(
    input: CreateCheckoutSessionInput,
): Promise<CreateCheckoutSessionResult> {
    const session = await input.provider.createCheckoutSession({
        workspaceId: input.workspaceId,
        userEmail: input.userEmail,
        variantId: input.variantId,
        successUrl: input.successUrl,
        cancelUrl: input.cancelUrl,
    });
    return { id: session.id, url: session.url };
}
