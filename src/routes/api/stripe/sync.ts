import { createFileRoute } from "@tanstack/react-router";
import { loadCloudPlugin, pluginAbsent } from "@/lib/billing/load-plugin";

// Core stub → @tcgvault/cloud `reconcileForUser` (R12): lost/delayed-webhook
// self-heal. The client POSTs here on the `?upgraded=1` return so a paid user is
// never stranded if the webhook is late. 501 when the plugin is absent.
export const Route = createFileRoute("/api/stripe/sync")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const plugin = await loadCloudPlugin();
				if (!plugin) return pluginAbsent();
				return plugin.reconcileForUser(request);
			},
		},
	},
});
