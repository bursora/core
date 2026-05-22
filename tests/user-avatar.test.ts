/**
 * Tests for the shared <UserAvatar /> primitive: deterministic initials,
 * stable color palette index from a userId hash, and the small set of
 * size tokens consumers can render at.
 *
 * Rendering itself is intentionally not exercised here — these helpers
 * are pure, so we cover them directly. The visual surface is a thin
 * wrapper that maps the size token to dimension + font classes.
 */

import {
    AVATAR_SIZES,
    USER_PALETTE,
    WORKSPACE_PALETTE,
    avatarInitials,
    avatarPaletteClass,
} from "@/lib/avatar";
import { describe, expect, test } from "bun:test";

describe("avatarInitials", () => {
    test("uses first letter of first and last token for multi-word names", () => {
        expect(avatarInitials("Jane Doe")).toBe("JD");
    });

    test("uses first two letters when given a single token", () => {
        expect(avatarInitials("madonna")).toBe("MA");
    });

    test("returns ? for whitespace-only input with no email fallback", () => {
        expect(avatarInitials("  ")).toBe("?");
    });

    test("derives initials from email local-part when name is empty", () => {
        expect(avatarInitials("", "jane.doe@example.com")).toBe("JD");
    });

    test("uses first two letters of email local-part with a single token", () => {
        expect(avatarInitials("", "vildanbina@gmail.com")).toBe("VI");
    });

    test("splits email local-part on dots, underscores, dashes, and plus signs", () => {
        expect(avatarInitials("", "mary_watson@x.com")).toBe("MW");
        expect(avatarInitials("", "mary-watson@x.com")).toBe("MW");
        expect(avatarInitials("", "mary+tag@x.com")).toBe("MT");
    });

    test("prefers name when both name and email are provided", () => {
        expect(avatarInitials("Jane Doe", "other@example.com")).toBe("JD");
    });

    test("returns ? when both name and email yield no tokens", () => {
        expect(avatarInitials("  ", "!!!@example.com")).toBe("?");
    });

    test("returns the single letter uppercased for one-character input", () => {
        expect(avatarInitials("a")).toBe("A");
    });

    test("returns ? when input has no letters", () => {
        expect(avatarInitials("!!!")).toBe("?");
    });

    test("ignores non-letter characters when picking initials", () => {
        expect(avatarInitials("José García")).toBe("JG");
    });

    test("collapses extra whitespace between tokens", () => {
        expect(avatarInitials("  Jane    Doe  ")).toBe("JD");
    });

    test("uses first and last token when more than two are given", () => {
        expect(avatarInitials("Mary Jane Watson")).toBe("MW");
    });
});

describe("avatarPaletteClass", () => {
    test("returns the same class for the same id + kind across calls", () => {
        expect(avatarPaletteClass("user_123", "user")).toBe(avatarPaletteClass("user_123", "user"));
    });

    test("returns a class from the user palette for kind=user", () => {
        for (const id of ["a", "b", "c", "user_abc", "00000000-0000-0000-0000-000000000000"]) {
            expect(USER_PALETTE).toContain(avatarPaletteClass(id, "user"));
        }
    });

    test("returns a class from the workspace palette for kind=workspace", () => {
        for (const id of ["a", "b", "c", "ws_abc"]) {
            expect(WORKSPACE_PALETTE).toContain(avatarPaletteClass(id, "workspace"));
        }
    });

    test("distinct ids usually map to distinct classes within a kind", () => {
        const classes = new Set(
            ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot"].map((id) =>
                avatarPaletteClass(id, "user"),
            ),
        );
        expect(classes.size).toBeGreaterThan(1);
    });

    test("same id under different kinds never returns the same class", () => {
        for (const id of ["alpha", "bravo", "charlie", "shared_id", "user_42"]) {
            expect(avatarPaletteClass(id, "user")).not.toBe(avatarPaletteClass(id, "workspace"));
        }
    });
});

describe("WORKSPACE_PALETTE and USER_PALETTE", () => {
    test("each palette has at least 10 entries", () => {
        expect(WORKSPACE_PALETTE.length).toBeGreaterThanOrEqual(10);
        expect(USER_PALETTE.length).toBeGreaterThanOrEqual(10);
    });

    test("palettes share no entries (disjoint hue families)", () => {
        const overlap = WORKSPACE_PALETTE.filter((entry) => USER_PALETTE.includes(entry));
        expect(overlap).toEqual([]);
    });

    test("every entry includes light and dark mode classes", () => {
        for (const classes of [...WORKSPACE_PALETTE, ...USER_PALETTE]) {
            expect(classes).toMatch(/bg-\w+-100/);
            expect(classes).toMatch(/text-\w+-900/);
            expect(classes).toMatch(/dark:bg-\w+-(?:800\/60|900\/40)/);
            expect(classes).toMatch(/dark:text-\w+-100/);
        }
    });
});

describe("AVATAR_SIZES", () => {
    test("exposes all five size tokens", () => {
        expect(Object.keys(AVATAR_SIZES).sort()).toEqual(["lg", "md", "sm", "xl", "xs"]);
    });

    test("xs is 20px with text-[10px]", () => {
        expect(AVATAR_SIZES.xs).toContain("h-5");
        expect(AVATAR_SIZES.xs).toContain("w-5");
        expect(AVATAR_SIZES.xs).toContain("text-[10px]");
    });

    test("sm is 24px with text-xs", () => {
        expect(AVATAR_SIZES.sm).toContain("h-6");
        expect(AVATAR_SIZES.sm).toContain("w-6");
        expect(AVATAR_SIZES.sm).toContain("text-xs");
    });

    test("md is 32px with text-sm", () => {
        expect(AVATAR_SIZES.md).toContain("h-8");
        expect(AVATAR_SIZES.md).toContain("w-8");
        expect(AVATAR_SIZES.md).toContain("text-sm");
    });

    test("lg is 48px with text-base", () => {
        expect(AVATAR_SIZES.lg).toContain("h-12");
        expect(AVATAR_SIZES.lg).toContain("w-12");
        expect(AVATAR_SIZES.lg).toContain("text-base");
    });

    test("xl is 96px with text-4xl", () => {
        expect(AVATAR_SIZES.xl).toContain("h-24");
        expect(AVATAR_SIZES.xl).toContain("w-24");
        expect(AVATAR_SIZES.xl).toContain("text-4xl");
    });
});
