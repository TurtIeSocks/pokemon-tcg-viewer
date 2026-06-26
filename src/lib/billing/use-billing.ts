// src/lib/billing/use-billing.ts
//
// UI-side billing helpers: a hook to read the (render-only) entitlement, and thin
// POSTs to the stub routes. When the @tcgvault/cloud plugin is absent the stubs
// return 501 → these resolve to null so the UI can say "billing not configured"
// instead of erroring (the open-core dev/self-host default).

"use client";

import { useCallback, useEffect, useState } from "react";
import {
	type Entitlement,
	getEntitlement,
	isBillingEnabled,
} from "./entitlement";

export interface BillingState {
	entitlement: Entitlement;
	billingEnabled: boolean;
	loading: boolean;
	/** Re-read entitlement (e.g. after returning from Checkout). */
	refresh: () => void;
}

const FREE: Entitlement = {
	tier: "free",
	status: null,
	currentPeriodEnd: null,
};

export function useBilling(): BillingState {
	const [entitlement, setEntitlement] = useState<Entitlement>(FREE);
	const [billingEnabled, setBillingEnabled] = useState(false);
	const [loading, setLoading] = useState(true);

	// refresh IS the fetch — called on mount and again after returning from
	// Checkout. Stable (only setters in scope), so the mount effect's dep is clean.
	const refresh = useCallback(() => {
		setLoading(true);
		void Promise.all([getEntitlement(), isBillingEnabled()]).then(
			([ent, enabled]) => {
				setEntitlement(ent);
				setBillingEnabled(enabled);
				setLoading(false);
			},
		);
	}, []);

	useEffect(() => {
		refresh();
	}, [refresh]);

	return { entitlement, billingEnabled, loading, refresh };
}

/**
 * POST a Stripe stub and return its redirect URL, or null when billing isn't
 * configured (501, plugin absent). Throws on a real server error.
 */
async function postStripe(path: string): Promise<string | null> {
	const res = await fetch(path, { method: "POST" });
	if (res.status === 501) return null; // plugin absent → not configured
	if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
	const data = (await res.json().catch(() => null)) as { url?: string } | null;
	return data?.url ?? null;
}

/** Start a Checkout session; returns the URL to redirect to (or null if unconfigured). */
export const startCheckout = (): Promise<string | null> =>
	postStripe("/api/stripe/checkout");

/** Open the Customer Portal; returns the URL to redirect to (or null if unconfigured). */
export const openPortal = (): Promise<string | null> =>
	postStripe("/api/stripe/portal");

/** Fire-and-forget reconcile on the `?upgraded=1` return (lost/late webhook self-heal). */
export const reconcileBilling = (): Promise<unknown> =>
	fetch("/api/stripe/sync", { method: "POST" }).catch(() => null);
