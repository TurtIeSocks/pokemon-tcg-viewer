import { createFileRoute } from "@tanstack/react-router";
import { type CloudPlugin, loadCloudPlugin } from "@/lib/billing/load-plugin";

// The 7 server-only billing env vars the plugin requires (src/env.ts in
// card-stack-cloud). Only the count is reported, never values or names —
// this endpoint is unauthenticated.
const BILLING_ENV_VARS = [
	"SUPABASE_URL",
	"SUPABASE_ANON_KEY",
	"SUPABASE_SERVICE_ROLE_KEY",
	"STRIPE_SECRET_KEY",
	"STRIPE_WEBHOOK_SECRET",
	"STRIPE_PRICE_PLUS_MONTHLY",
	"STRIPE_PRICE_PLUS_ANNUAL",
] as const;

export interface HealthReport {
	ok: true;
	plugin: "present" | "absent";
	billingEnv: number;
	supabase: boolean;
	billingConfigured?: boolean;
}

/**
 * Pure health-report builder — booleans/enums/counts only, never secret
 * values. Split out from the route handler so it's unit-testable without a
 * running server (see health.test.ts).
 */
export async function buildHealthReport(
	plugin: CloudPlugin | null,
): Promise<HealthReport> {
	const billingEnv = BILLING_ENV_VARS.filter((k) => !!process.env[k]).length;
	const supabase = !!process.env.VITE_SUPABASE_URL;

	const report: HealthReport = {
		ok: true,
		plugin: plugin ? "present" : "absent",
		billingEnv,
		supabase,
	};

	if (plugin) {
		try {
			const result = await plugin.assertBillingConfigured();
			report.billingConfigured = result.ok;
		} catch {
			report.billingConfigured = false;
		}
	}

	return report;
}

// Post-deploy gate (deploy.yml curls this after restart). Reuses
// loadCloudPlugin() for plugin presence — same memoized check the four
// /api/stripe/* stubs use.
export const Route = createFileRoute("/api/health")({
	server: {
		handlers: {
			GET: async () => {
				const plugin = await loadCloudPlugin();
				const report = await buildHealthReport(plugin);
				return new Response(JSON.stringify(report), {
					headers: { "content-type": "application/json" },
				});
			},
		},
	},
});
