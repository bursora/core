/**
 * Renders an SDK quickstart template by replacing sentinel literals with the
 * caller's workspace id and most-recent api key id. The example files keep
 * the sentinels as plain string literals so the .ts files still type-check
 * (e.g. `apiKey: "__BURSORA_API_KEY__"`).
 *
 * After substitution, any surviving sentinel (typically a typo like
 * `"__BURSORA_KEY__"`) throws — fail loud rather than ship a snippet that
 * still references a placeholder.
 */

const API_KEY_SENTINEL = '"__BURSORA_API_KEY__"';
const WORKSPACE_SENTINEL = '"__BURSORA_WORKSPACE_ID__"';
const ENDPOINT_SENTINEL = '"__BURSORA_ENDPOINT__"';
const SURVIVING_SENTINEL = /"__BURSORA_[A-Z_]+__"/;

export interface RenderSnippetVars {
    readonly apiKey: string;
    readonly workspaceId: string;
    readonly endpoint: string;
}

export function renderSnippet(template: string, vars: RenderSnippetVars): string {
    if (vars.apiKey === "") {
        throw new Error("renderSnippet: apiKey must not be empty");
    }
    if (vars.workspaceId === "") {
        throw new Error("renderSnippet: workspaceId must not be empty");
    }
    if (vars.endpoint === "") {
        throw new Error("renderSnippet: endpoint must not be empty");
    }

    const rendered = template
        .split(API_KEY_SENTINEL)
        .join(JSON.stringify(vars.apiKey))
        .split(WORKSPACE_SENTINEL)
        .join(JSON.stringify(vars.workspaceId))
        .split(ENDPOINT_SENTINEL)
        .join(JSON.stringify(vars.endpoint));

    const leftover = rendered.match(SURVIVING_SENTINEL);
    if (leftover) {
        throw new Error(
            `renderSnippet: unfilled sentinel ${leftover[0]} remains after substitution — likely a typo`,
        );
    }

    return rendered;
}
