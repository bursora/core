// Flat ESLint config for the Bursora app.
//
// Composes @eslint/js recommended, typescript-eslint strict (type-aware), and
// eslint-config-next (core-web-vitals + typescript). Adds the EE boundary
// rule restricting @/lib/ee imports to the handful of allowlisted callers.

import eslint from "@eslint/js";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import reactPlugin from "eslint-plugin-react";
import tseslint from "typescript-eslint";

const eeAllowedFiles = [
    "lib/ee/**/*.{ts,tsx}",
    "app/(dashboard)/workspace/[workspaceId]/settings/**/*.{ts,tsx}",
    "app/api/webhooks/lemonsqueezy/route.ts",
    "app/api/cron/billing-rollup/route.ts",
    "tests/billing/**/*.{ts,tsx}",
    "tests/features/billing.test.ts",
];

export default [
    {
        ignores: [
            "node_modules/**",
            ".next/**",
            ".claude/**",
            "drizzle/migrations/**",
            "eslint.config.js",
            "postcss.config.mjs",
            "next.config.ts",
        ],
    },
    eslint.configs.recommended,
    ...tseslint.configs.strict,
    ...nextCoreWebVitals,
    ...nextTypescript,
    {
        settings: {
            react: { version: "19" },
        },
    },
    {
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
    },
    {
        files: ["**/*.{ts,tsx}"],
        rules: {
            "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
            "@typescript-eslint/no-explicit-any": "error",
        },
    },
    // Ban inline `style={{...}}` props app-wide; shadcn primitives in
    // components/ui/ legitimately use them and are excluded below.
    {
        files: ["app/**/*.{ts,tsx,js,jsx}", "components/**/*.{ts,tsx}"],
        ignores: ["components/ui/**"],
        plugins: { react: reactPlugin },
        rules: {
            "react/forbid-dom-props": [
                "error",
                {
                    forbid: [
                        {
                            propName: "style",
                            message:
                                "Inline styles are banned. Use Tailwind utility classes; if a CSS variable is required, set it via a className-bound custom property in components/ui/.",
                        },
                    ],
                },
            ],
        },
    },
    // EE boundary: only allowlisted files may import from @/lib/ee/*.
    {
        files: ["**/*.{ts,tsx}"],
        ignores: eeAllowedFiles,
        rules: {
            "no-restricted-imports": [
                "error",
                {
                    patterns: [
                        {
                            regex: "^@/lib/ee(/.*)?$",
                            message:
                                "Only allowlisted files may import from @/lib/ee. See eslint.config.js for the list.",
                        },
                    ],
                },
            ],
        },
    },
    {
        files: ["tests/**/*.{ts,tsx}", "**/*.test.{ts,tsx}"],
        rules: {
            "@typescript-eslint/no-non-null-assertion": "off",
        },
    },
];
