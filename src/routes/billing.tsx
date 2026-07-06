// src/routes/billing.tsx
import { createFileRoute } from "@tanstack/react-router";
import { Check, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { GlassPanel } from "@/components/ui/glass";
import {
	openPortal,
	reconcileBilling,
	startCheckout,
	useBilling,
} from "@/lib/billing/use-billing";
import { isCloudEnabled } from "@/lib/supabase/client";

export const Route = createFileRoute("/billing")({
	// Stripe Checkout redirects back with ?upgraded=1 → reconcile + refresh.
	// Optional so plain links (`<Link to="/billing">`) need not supply it.
	validateSearch: (search: Record<string, unknown>): { upgraded?: boolean } =>
		search.upgraded === "1" || search.upgraded === 1 || search.upgraded === true
			? { upgraded: true }
			: {},
	head: () => ({ meta: [{ title: "Billing & plan · Cardstack" }] }),
	component: BillingPage,
});

const PLUS_FEATURES = [
	"Sync every card, every device",
	"Stacks and binders kept in sync",
	"Pick up on phone, tablet, or desktop",
] as const;

const FREE_FEATURES = [
	"Your full Vault, offline, no caps",
	"CSV import and export, always on",
	"Edit, delete, or export it anytime. It's your data.",
] as const;

function BillingPage() {
	const { upgraded } = Route.useSearch();
	const { entitlement, billingEnabled, loading, refresh } = useBilling();
	const [busy, setBusy] = useState(false);
	const [reconcileFailed, setReconcileFailed] = useState(false);
	const [reconcileUnauthorized, setReconcileUnauthorized] = useState(false);

	// Lost/late-webhook self-heal: on return from Checkout, reconcile then refresh.
	// The endpoint returns 500 + { ok: false } when the reconcile RPC itself fails
	// (vs. a plain network error) — surface that explicitly instead of silently
	// proceeding as if activation succeeded. A 401 means the session expired
	// between Checkout and this return redirect: that's a signed-out state, not
	// a failed reconcile, so it gets its own message asking the user to sign
	// back in rather than "activation is retrying".
	useEffect(() => {
		if (!upgraded) return;
		void reconcileBilling().then((result) => {
			refresh();
			if (result === "ok") {
				toast.success("You're on Plus. Your Vault now syncs everywhere.");
			} else if (result === "unauthorized") {
				setReconcileUnauthorized(true);
			} else {
				setReconcileFailed(true);
			}
		});
	}, [upgraded, refresh]);

	const isPaid = entitlement.tier === "plus" || entitlement.tier === "pro";

	async function go(action: () => Promise<string | null>) {
		setBusy(true);
		try {
			const url = await action();
			if (url) {
				window.location.href = url;
				return;
			}
			toast.message("Billing isn't configured on this instance yet.");
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Something went wrong.");
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="mx-auto w-full max-w-3xl px-4 py-8">
			<h1 className="mb-1 font-display font-semibold text-2xl text-(--ink)">
				Billing &amp; plan
			</h1>
			<p className="mb-6 text-(--ink-muted) text-sm">
				The whole app is free and local-first. Plus pays for the sync servers,
				not for access to your own cards. Self-hosters get it unbilled.
			</p>

			{reconcileUnauthorized && (
				<GlassPanel
					role="alert"
					className="mb-4 border-amber-400/30 p-4 text-sm"
				>
					<p className="font-medium text-(--ink)">
						Payment received. Please sign in again to finish activating Plus.
					</p>
				</GlassPanel>
			)}

			{reconcileFailed && (
				<GlassPanel
					role="alert"
					className="mb-4 border-amber-400/30 p-4 text-sm"
				>
					<p className="font-medium text-(--ink)">
						Payment received, activation is retrying.
					</p>
					<p className="mt-1 text-(--ink-muted)">
						Your Vault will unlock automatically in a few minutes. Contact
						support if this persists.
					</p>
				</GlassPanel>
			)}

			{!isCloudEnabled() ? (
				<GlassPanel className="p-4 text-(--ink-muted) text-sm">
					Cloud is off on this build. Your Vault lives on this device, and
					there's nothing to bill.
				</GlassPanel>
			) : !loading && !billingEnabled ? (
				<GlassPanel className="p-4 text-(--ink-muted) text-sm">
					This instance runs self-hosted, so every cloud feature is already
					free. Nothing to upgrade.
				</GlassPanel>
			) : (
				<div className="grid gap-4 sm:grid-cols-2">
					<TierCard
						name="Free"
						price="$0"
						features={FREE_FEATURES}
						current={!loading && !isPaid}
					/>
					<TierCard
						name="Plus"
						price="$4/mo · $36/yr"
						features={PLUS_FEATURES}
						highlight
						current={!loading && isPaid}
						action={
							loading ? null : isPaid ? (
								<Button
									variant="soft"
									className="w-full"
									disabled={busy}
									onClick={() => go(openPortal)}
								>
									Manage subscription
								</Button>
							) : (
								<Button
									className="w-full"
									disabled={busy}
									onClick={() => go(startCheckout)}
								>
									<Sparkles className="size-4" />
									Get Plus
								</Button>
							)
						}
					/>
				</div>
			)}
		</div>
	);
}

interface TierCardProps {
	name: string;
	price: string;
	features: readonly string[];
	highlight?: boolean;
	current?: boolean;
	action?: React.ReactNode;
}

function TierCard({
	name,
	price,
	features,
	highlight,
	current,
	action,
}: TierCardProps) {
	return (
		<GlassPanel
			className={
				highlight
					? "border-(--primary)/40 p-5 ring-1 ring-(--primary)/30"
					: "p-5"
			}
		>
			<div className="mb-1 flex items-center justify-between">
				<span className="font-display font-semibold text-(--ink)">{name}</span>
				{current && (
					<span className="rounded-full bg-(--success)/15 px-2 py-0.5 font-mono text-(--success) text-[10px] uppercase tracking-wide">
						Current
					</span>
				)}
			</div>
			<div className="mb-3 font-mono text-(--ink) text-lg tabular-nums">
				{price}
			</div>
			<ul className="mb-4 space-y-1.5">
				{features.map((f) => (
					<li
						key={f}
						className="flex items-start gap-2 text-(--ink-muted) text-sm"
					>
						<Check className="mt-0.5 size-3.5 shrink-0 text-(--primary)" />
						{f}
					</li>
				))}
			</ul>
			{action}
		</GlassPanel>
	);
}
