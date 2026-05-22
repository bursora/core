/**
 * Alert channel repository port.
 *
 * Reads channels from `alert_rules.channels` for a workspace, filtered by
 * rule kind. The kind discriminates which event class (anomaly vs budget)
 * a channel row receives: an `alert_rules` row with `kind='anomaly'` feeds
 * anomaly dispatch, and `kind='budget'` feeds budget dispatch.
 *
 * Writes go through `upsertChannelsForRuleKind`, which targets the row
 * for the given workspace + rule kind. Callers that want the same channels
 * to receive both kinds invoke upsert twice — once per kind.
 */

import type { AlertKind } from "../severity";
import type { AlertChannel } from "./alert-channel";

export interface AlertChannelRepository {
    listForRuleKind(workspaceId: string, ruleKind: AlertKind): Promise<readonly AlertChannel[]>;

    /**
     * Atomic upsert across one or more rule kinds. Implementations MUST
     * write all rows in a single transaction so the workspace never sees
     * partially-applied channel config.
     */
    upsertChannelsForRuleKinds(
        workspaceId: string,
        ruleKinds: readonly AlertKind[],
        channels: readonly AlertChannel[],
    ): Promise<void>;
}
