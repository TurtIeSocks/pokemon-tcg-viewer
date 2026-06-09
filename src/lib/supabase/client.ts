// Browser-side Supabase client + the cloud-enabled gate.
//
// Cloud is OPT-IN via two public Vite env vars. When either is missing the app
// is pure local-first (IndexedDB) with zero backend — no auth UI, no network.
// Only `VITE_`-prefixed vars reach the client bundle; the service_role key must
// NEVER appear here (RLS is the security boundary, the anon key is public).
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Read a Vite public env var. Wrapped in a function (not a module-level const)
 * so {@link isCloudEnabled} re-evaluates on every call — Vite statically inlines
 * `import.meta.env.VITE_*` at build time, and under `bun test` it's a plain
 * mutable object, so a fresh read works in both environments.
 */
function readEnv(key: "VITE_SUPABASE_URL" | "VITE_SUPABASE_ANON_KEY"): string {
	const value = (import.meta.env as Record<string, string | undefined>)[key];
	return typeof value === "string" ? value : "";
}

/** The Supabase project URL, or "" when cloud is disabled. */
export function supabaseUrl(): string {
	return readEnv("VITE_SUPABASE_URL");
}

/** The public anon key, or "" when cloud is disabled. */
export function supabaseAnonKey(): string {
	return readEnv("VITE_SUPABASE_ANON_KEY");
}

/**
 * True iff BOTH `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set
 * (non-empty). This is the single gate for every cloud code path: auth UI, the
 * `getRepos()` swap, the browser client. Unset → today's local-first Vault.
 */
export function isCloudEnabled(): boolean {
	return supabaseUrl() !== "" && supabaseAnonKey() !== "";
}

// Memoized singleton — one browser client per tab. `createBrowserClient` with no
// custom cookie adapter uses `document.cookie`, which is what we want: the PKCE
// code verifier + session live in cookies so the TanStack Start SSR server
// (server.ts) reads the same session.
let browserClient: SupabaseClient | null = null;

/**
 * The memoized browser Supabase client.
 *
 * @throws if called while {@link isCloudEnabled} is false — callers must gate on
 * the flag first. This makes a misconfigured cloud path fail loudly instead of
 * silently constructing a client against `""`.
 */
export function getBrowserClient(): SupabaseClient {
	if (!isCloudEnabled()) {
		throw new Error(
			"getBrowserClient() called while cloud is disabled. Set VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY, and gate callers on isCloudEnabled().",
		);
	}
	if (browserClient === null) {
		browserClient = createBrowserClient(supabaseUrl(), supabaseAnonKey());
	}
	return browserClient;
}
