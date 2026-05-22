/**
 * Standard result envelope returned by every server action in the
 * dashboard. Lets clients (`useActionState`, plain `await`) consume both
 * success and failure without try/catch around the action itself.
 *
 * Success-path actions that call `redirect()` never actually reach the
 * `return { ok: true }` statement — `redirect` throws — but the shape is
 * still part of the contract so client wrappers can assume it.
 */

export interface ActionResult {
    readonly ok: boolean;
    readonly error?: string;
    readonly fieldErrors?: Readonly<Record<string, string>>;
}

export const actionOk = (): ActionResult => ({ ok: true });

export const actionFail = (
    error: string,
    fieldErrors?: Readonly<Record<string, string>>,
): ActionResult => ({ ok: false, error, ...(fieldErrors ? { fieldErrors } : {}) });
