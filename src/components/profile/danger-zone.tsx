// src/components/profile/danger-zone.tsx
//
// Profile page "Danger zone": link to the existing Vault CSV/backup export, and
// self-serve account deletion (type-to-confirm the signed-in email). Shown only
// when signed in AND billing is configured (hosted mode) — self-hosters without
// the plugin use `supabase auth admin` per deploy/DEPLOY.md.

"use client";

import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { signOut } from "@/components/auth/auth-actions";
import { useAuthSession } from "@/components/auth/use-auth-session";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { GlassPanel } from "@/components/ui/glass";
import { Input } from "@/components/ui/input";
import { useBilling } from "@/lib/billing/use-billing";

/**
 * Gate + subscribe wrapper: reads auth/billing state itself (so the parent
 * profile page never re-renders on it) and renders nothing until signed in with
 * hosted billing configured.
 */
export function DangerZone() {
	const { email } = useAuthSession();
	const { billingEnabled } = useBilling();

	if (!email || !billingEnabled) return null;
	return <DangerZonePanel email={email} />;
}

/** Props for {@link DangerZonePanel}. */
interface DangerZonePanelProps {
	/** The signed-in user's email; type-to-confirm target for deletion. */
	email: string;
}

function DangerZonePanel({ email }: DangerZonePanelProps) {
	const [confirmOpen, setConfirmOpen] = useState(false);

	return (
		<section className="mt-8 space-y-3.5">
			<h2 className="font-display text-[21px] font-medium text-[var(--ink)]">
				Danger zone
			</h2>
			<GlassPanel className="flex flex-wrap items-center justify-between gap-4 p-5">
				<div className="space-y-1">
					<p className="text-sm font-medium text-[var(--ink)]">
						Export my data
					</p>
					<p className="text-sm text-[var(--ink-muted)]">
						Download your full collection as a backup or CSV, any time.
					</p>
				</div>
				<Button variant="secondary" size="sm" asChild>
					<Link to="/vault/cards">Go to export</Link>
				</Button>
			</GlassPanel>
			<GlassPanel className="flex flex-wrap items-center justify-between gap-4 border-[color-mix(in_oklch,var(--danger)_35%,var(--border))] p-5">
				<div className="space-y-1">
					<p className="text-sm font-medium text-[var(--ink)]">
						Delete my account
					</p>
					<p className="text-sm text-[var(--ink-muted)]">
						Cancels any active subscription and permanently deletes your account
						and vault. This cannot be undone.
					</p>
				</div>
				<Button
					variant="destructive"
					size="sm"
					onClick={() => setConfirmOpen(true)}
				>
					Delete account
				</Button>
			</GlassPanel>
			<DeleteAccountDialog
				open={confirmOpen}
				onOpenChange={setConfirmOpen}
				email={email}
			/>
		</section>
	);
}

interface DeleteAccountDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	email: string;
}

function DeleteAccountDialog({
	open,
	onOpenChange,
	email,
}: DeleteAccountDialogProps) {
	const [typed, setTyped] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const matches = typed.trim().toLowerCase() === email.toLowerCase();

	async function handleDelete() {
		if (!matches || submitting) return;
		setSubmitting(true);
		setError(null);
		try {
			const res = await fetch("/api/account/delete", { method: "POST" });
			if (!res.ok) {
				setError(
					res.status === 501
						? "Account deletion isn't available on this deployment."
						: "Something went wrong. Please try again.",
				);
				setSubmitting(false);
				return;
			}
			// The account (and its Supabase session) no longer exists server-side;
			// signOut() clears local session cookies and fires SIGNED_OUT, which the
			// userland store's auth listener (subscribeAuth) already handles: it
			// drops the cache bundle + stops background sync + re-hydrates from the
			// signed-out IDB Vault. A full navigation (not client-side route) ensures
			// every in-memory store starts clean on the next page.
			await signOut();
			window.location.assign("/");
		} catch {
			setError("Something went wrong. Please try again.");
			setSubmitting(false);
		}
	}

	return (
		<Dialog
			key={open ? "open" : "closed"}
			open={open}
			onOpenChange={onOpenChange}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle className="font-display">Delete account</DialogTitle>
					<DialogDescription>
						This permanently deletes your account, your vault, and cancels any
						active subscription. Type <strong>{email}</strong> to confirm.
					</DialogDescription>
				</DialogHeader>

				<Input
					value={typed}
					onChange={(e) => setTyped(e.target.value)}
					placeholder={email}
					aria-label="Type your email to confirm"
					autoComplete="off"
				/>
				{error && <p className="text-sm text-[var(--danger)]">{error}</p>}

				<DialogFooter>
					<Button
						type="button"
						variant="ghost"
						onClick={() => onOpenChange(false)}
					>
						Cancel
					</Button>
					<Button
						type="button"
						variant="destructive"
						disabled={!matches || submitting}
						onClick={handleDelete}
					>
						{submitting ? "Deleting…" : "Delete my account"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
