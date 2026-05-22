import {
    optionalField,
    requireField,
    rethrowRedirect,
    workspaceIdFromForm,
    workspaceIdFromPrevForm,
} from "@/lib/actions/form-fields";
import { describe, expect, test } from "bun:test";

const fd = (entries: Record<string, string>): FormData => {
    const f = new FormData();
    for (const [k, v] of Object.entries(entries)) f.append(k, v);
    return f;
};

describe("requireField", () => {
    test("returns string when present", () => {
        expect(requireField(fd({ name: "alice" }), "name")).toBe("alice");
    });
    test("throws when missing", () => {
        expect(() => requireField(fd({}), "name")).toThrow("missing required field: name");
    });
    test("throws when empty", () => {
        expect(() => requireField(fd({ name: "" }), "name")).toThrow();
    });
});

describe("optionalField", () => {
    test("returns string when present", () => {
        expect(optionalField(fd({ x: "v" }), "x")).toBe("v");
    });
    test("returns null when missing", () => {
        expect(optionalField(fd({}), "x")).toBeNull();
    });
    test("returns null when empty", () => {
        expect(optionalField(fd({ x: "" }), "x")).toBeNull();
    });
});

describe("workspaceIdFromForm", () => {
    test("reads workspaceId field", () => {
        expect(workspaceIdFromForm(fd({ workspaceId: "w1" }))).toBe("w1");
    });
    test("throws when missing", () => {
        expect(() => workspaceIdFromForm(fd({}))).toThrow();
    });
});

describe("workspaceIdFromPrevForm", () => {
    test("ignores prev, reads from form", () => {
        expect(workspaceIdFromPrevForm({ ok: true }, fd({ workspaceId: "w2" }))).toBe("w2");
    });
});

describe("rethrowRedirect", () => {
    test("re-throws NEXT_REDIRECT errors", () => {
        const err = new Error("NEXT_REDIRECT");
        expect(() => rethrowRedirect(err)).toThrow("NEXT_REDIRECT");
    });
    test("does nothing for other errors", () => {
        expect(() => rethrowRedirect(new Error("boom"))).not.toThrow();
    });
    test("does nothing for non-Error values", () => {
        expect(() => rethrowRedirect("NEXT_REDIRECT")).not.toThrow();
        expect(() => rethrowRedirect(null)).not.toThrow();
    });
});
