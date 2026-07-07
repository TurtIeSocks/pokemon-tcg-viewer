import { createFileRoute } from "@tanstack/react-router";
import { handleScan } from "@/lib/scan/scan-handler";

// Entitlement-gated AI vision scan (R5, R6). Thin route — all logic lives in
// the DI-testable handler so tests never construct a live Anthropic client
// or hit the network (see scan-handler.test.ts).
export const Route = createFileRoute("/api/scan")({
	server: {
		handlers: {
			POST: async ({ request }) => handleScan(request),
		},
	},
});
