/**
 * Default workspace name for the setup wizard's step ①. Derives a friendly
 * "{firstName}'s Workspace" so a brand-new user can accept it with one keystroke.
 *
 * First name is the first whitespace token of the account name; when that's
 * empty it falls back to the email local-part; when both are empty the default
 * is an empty string (the field renders blank and the user types their own).
 */

function firstNameFrom(name: string | null | undefined): string {
    return (name ?? "").trim().split(/\s+/)[0] ?? "";
}

function emailLocalPart(email: string | null | undefined): string {
    const at = (email ?? "").indexOf("@");
    return at > 0 ? (email ?? "").slice(0, at) : "";
}

export function deriveOnboardingWorkspaceName(input: {
    readonly name: string | null | undefined;
    readonly email: string | null | undefined;
}): string {
    const first = firstNameFrom(input.name) || emailLocalPart(input.email);
    return first ? `${first}'s Workspace` : "";
}
