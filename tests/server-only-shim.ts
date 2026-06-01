/**
 * Bun test preload. The `server-only` package throws on import outside
 * the React Server Components bundler condition; tests run server modules
 * directly, so register a no-op stub for that module. The `next/navigation`
 * `useRouter` hook also throws outside the app-router context, so register
 * a stub that returns a no-op router for tests that render client components
 * directly via `renderToStaticMarkup`.
 *
 * Scope: the shim only covers static rendering. Tests that simulate click
 * events on client components (e.g. via testing-library) would silently pass
 * even when production code depends on `router.refresh()` re-fetching RSCs.
 * Such tests should inject a spy router via a per-test module mock instead
 * of relying on this preload.
 */
import { plugin } from "bun";

plugin({
    name: "server-only-shim",
    setup(build) {
        build.module("server-only", () => ({
            loader: "js",
            contents: "export {};",
        }));
        build.module("next/navigation", () => ({
            loader: "js",
            contents: `
                export function useRouter() {
                    return {
                        push: () => {},
                        replace: () => {},
                        refresh: () => {},
                        back: () => {},
                        forward: () => {},
                        prefetch: () => {},
                    };
                }
                export function usePathname() { return ""; }
                export function useSearchParams() { return new URLSearchParams(); }
                export function useParams() { return {}; }
                export function redirect() {}
                export function notFound() {}
            `,
        }));
        build.module("next/headers", () => ({
            loader: "js",
            contents: `
                export async function cookies() {
                    return {
                        get: () => undefined,
                        getAll: () => [],
                        set: () => {},
                        delete: () => {},
                        has: () => false,
                    };
                }
                export async function headers() { return new Headers(); }
            `,
        }));
    },
});
