/**
 * Save alert channels use case.
 *
 * Upserts the workspace's `alert_rules.channels` jsonb. Writes identical
 * channels to BOTH the 'anomaly' and 'budget' rule rows so a single form
 * drives both dispatch paths. The dispatcher filters by rule kind at
 * delivery time.
 *
 * URL shape is enforced here (Slack/Discord). Email shape is enforced
 * upstream at the action boundary via the shared schema — the use case
 * trusts the address it receives.
 *
 * Empty input (`{}`) clears all channels for both rule kinds.
 */

import type { AlertChannel } from "./alert-channel";
import type { AlertChannelRepository } from "./alert-channel.repository";
import type { AlertKind } from "../severity";

const SLACK_PREFIX = "https://hooks.slack.com/";
const DISCORD_PREFIXES = [
    "https://discord.com/api/webhooks/",
    "https://discordapp.com/api/webhooks/",
] as const;

const RULE_KINDS: readonly AlertKind[] = ["anomaly", "budget"];

export interface AlertChannelsInput {
    readonly slack?: { readonly url: string };
    readonly discord?: { readonly url: string };
    readonly email?: { readonly address: string };
}

export interface SaveAlertChannelsInput {
    readonly channels: AlertChannelRepository;
    readonly workspaceId: string;
    readonly input: AlertChannelsInput;
}

export async function saveAlertChannels(input: SaveAlertChannelsInput): Promise<void> {
    const list = toChannels(input.input);
    await input.channels.upsertChannelsForRuleKinds(input.workspaceId, RULE_KINDS, list);
}

const toChannels = (view: AlertChannelsInput): readonly AlertChannel[] => {
    const out: AlertChannel[] = [];
    if (view.slack) {
        assertSlackUrl(view.slack.url);
        out.push({ kind: "slack", url: view.slack.url });
    }
    if (view.discord) {
        assertDiscordUrl(view.discord.url);
        out.push({ kind: "discord", url: view.discord.url });
    }
    if (view.email) {
        out.push({ kind: "email", address: view.email.address });
    }
    return out;
};

const assertSlackUrl = (url: string): void => {
    if (!url.startsWith(SLACK_PREFIX)) {
        throw new Error(`slack webhook URL must start with ${SLACK_PREFIX}`);
    }
};

const assertDiscordUrl = (url: string): void => {
    for (const prefix of DISCORD_PREFIXES) {
        if (url.startsWith(prefix)) return;
    }
    throw new Error(
        `discord webhook URL must start with ${DISCORD_PREFIXES[0]} or ${DISCORD_PREFIXES[1]}`,
    );
};
