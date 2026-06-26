import { createFileRoute } from "@tanstack/react-router";
import { loadCloudPlugin, pluginAbsent } from "@/lib/billing/load-plugin";

// Core stub. The real handler (raw-body read, signature verify, atomic RPC) lives
// in the private @tcgvault/cloud plugin; here we only delegate or 501. Must be a
// server route (NOT createServerFn, which re-serializes the body and breaks the
// Stripe HMAC).
export const Route = createFileRoute("/api/stripe/webhook")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const plugin = await loadCloudPlugin();
				if (!plugin) return pluginAbsent();
				return plugin.handleStripeWebhook(request);
			},
		},
	},
});
