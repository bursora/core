/**
 * List alert channels use case.
 *
 * Returns the workspace's configured channels in form-friendly shape:
 *   `{ slack?: { url }, discord?: { url }, email?: { address } }`
 *
 * Reads from the 'anomaly' rule row as the canonical channel config — the
 * save use case keeps the 'budget' row in sync, so one read is enough to
 * render the settings UI.
 */

import type { AlertChannel } from "./alert-channel";
import type { AlertChannelRepository } from "./alert-channel.repository";

export interface AlertChannelsView {
    readonly slack?: { readonly url: string };
    readonly discord?: { readonly url: string };
    readonly email?: { readonly address: string };
}

export interface ListAlertChannelsInput {
    readonly channels: AlertChannelRepository;
    readonly workspaceId: string;
}

export async function listAlertChannels(input: ListAlertChannelsInput): Promise<AlertChannelsView> {
    const list = await input.channels.listForRuleKind(input.workspaceId, "anomaly");
    return toView(list);
}

const toView = (channels: readonly AlertChannel[]): AlertChannelsView => {
    const out: {
        slack?: { url: string };
        discord?: { url: string };
        email?: { address: string };
    } = {};
    for (const channel of channels) {
        if (channel.kind === "slack") {
            out.slack = { url: channel.url };
        } else if (channel.kind === "discord") {
            out.discord = { url: channel.url };
        } else if (channel.kind === "email") {
            out.email = { address: channel.address };
        }
    }
    return out;
};
