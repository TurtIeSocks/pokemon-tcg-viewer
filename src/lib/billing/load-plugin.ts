// src/lib/billing/load-plugin.ts
//
// Loads the PRIVATE @tcgvault/cloud billing plugin at runtime, or null when it's
// absent (the open-core default: the public repo never vendors it, self-hosters
// without billing simply don't install it).
//
// R6: the specifier is computed at runtime (not a static string literal) and the
// package is in vite `ssr.external`, so the bundler never tries to resolve it at
// build time — `bun run build` succeeds with the plugin absent. The four
// `src/routes/api/stripe/*` stubs call this and return 501 when it's null.

/** The server-only surface the billing plugin exposes. Implemented in @tcgvault/cloud. */
export interface CloudPlugin {
	handleStripeWebhook(request: Request): Promise<Response>;
	createCheckoutSession(request: Request): Promise<Response>;
	createPortalSession(request: Request): Promise<Response>;
	reconcileForUser(request: Request): Promise<Response>;
	/** R16 misconfig guard (STRIPE_SECRET_KEY set but billing_config.billing_enabled false). Used by /api/health. */
	assertBillingConfigured(): Promise<{ ok: boolean; warning?: string }>;
	/**
	 * Self-serve account deletion: cancels the user's active Stripe subscriptions,
	 * then deletes the auth user (cascades all vault + billing rows). Optional —
	 * older plugin builds predate this member and stay type-compatible; the
	 * `/api/account/delete` stub returns 501 when it's absent.
	 */
	deleteAccount?(request: Request): Promise<Response>;
}

let cached: CloudPlugin | null | undefined;

/** Returns the plugin, or null if it isn't installed. Memoized per process. */
export async function loadCloudPlugin(): Promise<CloudPlugin | null> {
	if (cached !== undefined) return cached;
	const pkg = ["@tcgvault", "cloud"].join("/"); // non-statically-analyzable
	try {
		cached = (await import(/* @vite-ignore */ pkg)) as CloudPlugin;
	} catch {
		cached = null;
	}
	return cached;
}

/** Standard 501 when the billing plugin isn't installed. */
export function pluginAbsent(): Response {
	return new Response("billing module not installed", { status: 501 });
}
