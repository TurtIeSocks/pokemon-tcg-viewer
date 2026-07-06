// src/components/vault/past-due-banner.tsx
//
// Banner shown when the signed-in user's subscription is `past_due` — inside
// the 7-day grace the server (getEntitlement) still honors, sync keeps working,
// but the card is failing. Nudges to the Stripe portal before sync actually locks.
// Gated on isCloudEnabled() via useBilling's own fail-open (cloud off → tier
// stays "free", status stays null) — never renders in pure local-first mode.

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { openPortal, useBilling } from "@/lib/billing/use-billing";

/** Warning banner: subscription payment failed, still in the grace window. */
export function PastDueBanner() {
	const { entitlement } = useBilling();
	const [dismissed, setDismissed] = useState(false);
	const [busy, setBusy] = useState(false);

	if (dismissed || entitlement.status !== "past_due") return null;

	async function handleUpdateCard() {
		setBusy(true);
		try {
			const url = await openPortal();
			if (url) window.location.href = url;
		} finally {
			setBusy(false);
		}
	}

	return (
		<div
			role="alert"
			className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--r-panel)] border border-amber-400/30 bg-white/[0.05] px-4 py-3 backdrop-blur-xl motion-reduce:transition-none"
		>
			<p className="text-sm text-(--ink)">
				Payment issue. Update your card to keep syncing.
			</p>
			<div className="flex gap-2">
				<Button
					type="button"
					variant="soft"
					size="sm"
					disabled={busy}
					onClick={() => {
						void handleUpdateCard();
					}}
				>
					Update card
				</Button>
				<button
					type="button"
					onClick={() => setDismissed(true)}
					className="rounded-[var(--r-pill)] border border-white/10 px-3 py-1.5 text-xs font-medium text-(--ink-muted) transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--primary)"
				>
					Dismiss
				</button>
			</div>
		</div>
	);
}
