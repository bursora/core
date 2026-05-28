/**
 * Settings wiring. Composition root for the /settings page.
 *
 * Binds the workspace-scoped pricing override and alert channel use cases
 * to their drizzle adapters. API key use cases live in
 * `./identity/server` and are reused as-is — settings deep-imports
 * those bindings instead of re-declaring them here.
 *
 * Layer rule: `lib/` lives outside the boundaries config and is the only
 * place that reaches across contexts.
 */

import "server-only";

import { db } from "@/lib/db";
import { createPricingOverride } from "../metering/pricing/create-pricing-override.usecase";
import { drizzlePricingRepository } from "../metering/pricing/drizzle-pricing.repository";
import {
    listEffectivePricing,
    type EffectivePricingEntry,
} from "../metering/pricing/list-effective-pricing.usecase";
import { updatePricingOverride } from "../metering/pricing/update-pricing-override.usecase";
import { drizzleAlertChannelRepository } from "../notification/drizzle-alert-channel.repository";
import {
    listAlertChannels,
    type AlertChannelsView,
} from "../notification/list-alert-channels.usecase";
import {
    saveAlertChannels,
    type AlertChannelsInput,
} from "../notification/save-alert-channels.usecase";

const pricing = () => drizzlePricingRepository(db());
const alertChannels = () => drizzleAlertChannelRepository(db());

export interface CreatePricingOverrideArgs {
    workspaceId: string;
    provider: string;
    model: string;
    region: string;
    inputPer1mUsd: string;
    outputPer1mUsd: string;
    cachePer1mUsd: string | null;
    effectiveFrom: Date;
    effectiveTo: Date | null;
}

export async function createPricingOverrideForWorkspace(args: CreatePricingOverrideArgs) {
    return createPricingOverride({ ...args, pricing: pricing() });
}

export async function listPricingOverridesForWorkspace(workspaceId: string) {
    return pricing().listOverridesByWorkspace(workspaceId);
}

export async function listEffectivePricingForWorkspace(
    workspaceId: string,
): Promise<readonly EffectivePricingEntry[]> {
    return listEffectivePricing({ pricing: pricing(), workspaceId, now: new Date() });
}

export async function deletePricingOverrideForWorkspace(args: { workspaceId: string; id: string }) {
    return pricing().deleteOverride({ id: args.id, workspaceId: args.workspaceId });
}

export interface UpdatePricingOverrideArgs extends CreatePricingOverrideArgs {
    id: string;
}

export async function updatePricingOverrideForWorkspace(args: UpdatePricingOverrideArgs) {
    return updatePricingOverride({ ...args, pricing: pricing() });
}

export async function listAlertChannelsForWorkspace(
    workspaceId: string,
): Promise<AlertChannelsView> {
    return listAlertChannels({ channels: alertChannels(), workspaceId });
}

export async function saveAlertChannelsForWorkspace(args: {
    workspaceId: string;
    input: AlertChannelsInput;
}) {
    return saveAlertChannels({ channels: alertChannels(), ...args });
}
