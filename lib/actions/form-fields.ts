/**
 * Shared form-field helpers for server actions. Extracted to avoid the same
 * `formData.get` + type-narrow dance being copy-pasted across every action file.
 */

export function requireField(formData: FormData, name: string): string {
    const value = formData.get(name);
    if (typeof value !== "string" || value.length === 0) {
        throw new Error(`missing required field: ${name}`);
    }
    return value;
}

export function optionalField(formData: FormData, name: string): string | null {
    const value = formData.get(name);
    if (typeof value !== "string" || value.length === 0) return null;
    return value;
}

export function workspaceIdFromForm(formData: FormData): string {
    return requireField(formData, "workspaceId");
}

// For `(prev, formData)` action signatures: workspaceId still comes from the
// FormData (second arg).
export function workspaceIdFromPrevForm(_prev: unknown, formData: FormData): string {
    return requireField(formData, "workspaceId");
}

// Server actions that call `redirect()` rely on Next throwing a NEXT_REDIRECT
// error to unwind the stack. A surrounding try/catch must re-throw it instead
// of treating it as a handler failure.
export function rethrowRedirect(err: unknown): void {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
}
