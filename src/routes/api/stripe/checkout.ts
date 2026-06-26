import { createFileRoute } from "@tanstack/react-router";
import { loadCloudPlugin, pluginAbsent } from "@/lib/billing/load-plugin";

// Core stub → @tcgvault/cloud `createCheckoutSession` (reads the SSR session,
// creates a Stripe Checkout session, returns its URL). 501 when the plugin is absent.
export const Route = createFileRoute("/api/stripe/checkout")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const plugin = await loadCloudPlugin();
				if (!plugin) return pluginAbsent();
				return plugin.createCheckoutSession(request);
			},
		},
	},
});
