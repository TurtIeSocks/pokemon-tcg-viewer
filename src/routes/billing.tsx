// src/routes/billing.tsx
import { createFileRoute } from "@tanstack/react-router";
import { Check, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/eyebrow";
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
	head: () => ({ meta: [{ title: "Billing & plan — Pokémon TCG" }] }),
	component: BillingPage,
});

const PLUS_FEATURES = [
	"Unlimited multi-device cloud sync",
	"Every stack + binder synced",
	"Sync across phone, tablet, desktop",
] as const;

const FREE_FEATURES = [
	"Full local Vault — uncapped, offline",
	"CSV import + export, always on",
	"Edit, delete, and export anytime",
] as const;

function BillingPage() {
	const { upgraded } = Route.useSearch();
	const { entitlement, billingEnabled, loading, refresh } = useBilling();
	const [busy, setBusy] = useState(false);

	// Lost/late-webhook self-heal: on return from Checkout, reconcile then refresh.
	useEffect(() => {
		if (!upgraded) return;
		void reconcileBilling().then(() => {
			refresh();
			toast.success("Welcome to Plus — your Vault now syncs everywhere.");
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
			<Eyebrow>Plan</Eyebrow>
			<h1 className="mb-1 font-display font-semibold text-2xl text-(--ink)">
				Billing &amp; plan
			</h1>
			<p className="mb-6 text-(--ink-muted) text-sm">
				The whole app is free and local-first. Plus adds hosted multi-device
				sync — self-hosters get it unbilled.
			</p>

			{!isCloudEnabled() ? (
				<GlassPanel className="p-4 text-(--ink-muted) text-sm">
					Cloud is disabled on this build — the Vault is local-only. Nothing to
					bill.
				</GlassPanel>
			) : !loading && !billingEnabled ? (
				<GlassPanel className="p-4 text-(--ink-muted) text-sm">
					This instance doesn't have hosted billing enabled — all cloud features
					are free (self-hosted). Nothing to upgrade.
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
									Upgrade to Plus
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
