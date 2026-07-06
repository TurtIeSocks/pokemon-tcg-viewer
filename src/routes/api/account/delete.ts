import { createFileRoute } from "@tanstack/react-router";
import { loadCloudPlugin, pluginAbsent } from "@/lib/billing/load-plugin";

// Core stub. The real handler (auth, cancel active Stripe subs, delete the auth
// user) lives in the private @tcgvault/cloud plugin; here we only delegate or
// 501 — both when the plugin isn't installed AND when an older plugin build
// predates this optional member (self-host without billing, or a stale install).
export const Route = createFileRoute("/api/account/delete")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const plugin = await loadCloudPlugin();
				if (!plugin?.deleteAccount) return pluginAbsent();
				return plugin.deleteAccount(request);
			},
		},
	},
});
