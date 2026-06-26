// src/lib/billing/entitlement.ts
//
// Core-side entitlement READ. No Stripe import — entitlement is a row, not a code
// call, read through the normal browser client under RLS.
//
// INVARIANT (R15): everything here is RENDER-ONLY and fail-open. It MUST NEVER be
// used as a gate. The real gate is the RLS `with check` on the server; this helper
// only decides which UI to show. Any error → treat as free, never block the Vault.

import { getBrowserClient, isCloudEnabled } from "@/lib/supabase/client";

export type Tier = "free" | "plus" | "pro";

export interface Entitlement {
	tier: Tier;
	status: string | null;
	currentPeriodEnd: string | null;
}

const FREE: Entitlement = {
	tier: "free",
	status: null,
	currentPeriodEnd: null,
};

/** Cosmetic: is hosted billing configured? Reads the world-readable billing_config row. */
export async function isBillingEnabled(): Promise<boolean> {
	if (!isCloudEnabled()) return false;
	try {
		const { data } = await getBrowserClient()
			.from("billing_config")
			.select("billing_enabled")
			.maybeSingle();
		return data?.billing_enabled ?? false;
	} catch {
		return false;
	}
}

/**
 * The signed-in user's entitlement, for UI only. Reads the user's own
 * subscription row (RLS-scoped). FAIL-OPEN: any error → free. The display
 * heuristic loosely mirrors the server's `is_pro`, but the server is the truth.
 */
export async function getEntitlement(): Promise<Entitlement> {
	if (!isCloudEnabled()) return FREE;
	try {
		const { data } = await getBrowserClient()
			.from("subscriptions")
			.select("status, plan, price_id, current_period_end")
			.in("status", ["active", "trialing", "past_due"])
			.order("current_period_end", { ascending: false })
			.limit(1)
			.maybeSingle();
		if (!data) return FREE;
		const active =
			data.status === "active" ||
			data.status === "trialing" ||
			(data.status === "past_due" &&
				new Date(data.current_period_end).getTime() >
					Date.now() - 7 * 86_400_000);
		if (!active)
			return { tier: "free", status: data.status, currentPeriodEnd: null };
		return {
			tier: (data.plan as Tier) ?? "plus",
			status: data.status,
			currentPeriodEnd: data.current_period_end,
		};
	} catch {
		return FREE; // fail-open: never block loading
	}
}
