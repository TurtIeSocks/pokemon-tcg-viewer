import { describe, expect, it } from "bun:test";
import type { CloudPlugin } from "@/lib/billing/load-plugin";
import { buildHealthReport } from "./health";

describe("buildHealthReport", () => {
	it("reports plugin absent and billingConfigured omitted when plugin is null", async () => {
		const report = await buildHealthReport(null);
		expect(report.ok).toBe(true);
		expect(report.plugin).toBe("absent");
		expect(report.billingConfigured).toBeUndefined();
		expect(typeof report.billingEnv).toBe("number");
		expect(typeof report.supabase).toBe("boolean");
	});

	it("reports plugin present and calls assertBillingConfigured when plugin is provided", async () => {
		const plugin: CloudPlugin = {
			handleStripeWebhook: async () => new Response(null),
			createCheckoutSession: async () => new Response(null),
			createPortalSession: async () => new Response(null),
			reconcileForUser: async () => new Response(null),
			assertBillingConfigured: async () => ({ ok: true }),
		};
		const report = await buildHealthReport(plugin);
		expect(report.plugin).toBe("present");
		expect(report.billingConfigured).toBe(true);
	});

	it("reports billingConfigured: false when assertBillingConfigured throws", async () => {
		const plugin: CloudPlugin = {
			handleStripeWebhook: async () => new Response(null),
			createCheckoutSession: async () => new Response(null),
			createPortalSession: async () => new Response(null),
			reconcileForUser: async () => new Response(null),
			assertBillingConfigured: async () => {
				throw new Error("db unreachable");
			},
		};
		const report = await buildHealthReport(plugin);
		expect(report.plugin).toBe("present");
		expect(report.billingConfigured).toBe(false);
	});

	it("reports billingConfigured: false when assertBillingConfigured resolves ok:false", async () => {
		const plugin: CloudPlugin = {
			handleStripeWebhook: async () => new Response(null),
			createCheckoutSession: async () => new Response(null),
			createPortalSession: async () => new Response(null),
			reconcileForUser: async () => new Response(null),
			assertBillingConfigured: async () => ({
				ok: false,
				warning: "billing_enabled is false",
			}),
		};
		const report = await buildHealthReport(plugin);
		expect(report.billingConfigured).toBe(false);
	});
});
