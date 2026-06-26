import { createFileRoute } from "@tanstack/react-router";
import { loadCloudPlugin, pluginAbsent } from "@/lib/billing/load-plugin";

// Core stub → @tcgvault/cloud `createPortalSession` (Stripe Customer Portal URL
// for self-serve cancel / upgrade / payment-method). 501 when the plugin is absent.
export const Route = createFileRoute("/api/stripe/portal")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const plugin = await loadCloudPlugin();
				if (!plugin) return pluginAbsent();
				return plugin.createPortalSession(request);
			},
		},
	},
});
