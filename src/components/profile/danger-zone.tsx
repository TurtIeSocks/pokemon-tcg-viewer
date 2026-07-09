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
import { m } from "@/paraglide/messages";

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
			<h2 className="font-display text-[21px] font-medium text-(--ink)">
				{m.profile_danger_zone_heading()}
			</h2>
			<GlassPanel className="flex flex-wrap items-center justify-between gap-4 p-5">
				<div className="space-y-1">
					<p className="text-sm font-medium text-(--ink)">
						{m.profile_export_data_title()}
					</p>
					<p className="text-sm text-(--ink-muted)">
						{m.profile_export_data_body()}
					</p>
				</div>
				<Button variant="secondary" size="sm" asChild>
					<Link to="/vault/cards">{m.profile_go_to_export()}</Link>
				</Button>
			</GlassPanel>
			<GlassPanel className="flex flex-wrap items-center justify-between gap-4 border-[color-mix(in_oklch,var(--danger)_35%,var(--border))] p-5">
				<div className="space-y-1">
					<p className="text-sm font-medium text-(--ink)">
						{m.profile_delete_my_account()}
					</p>
					<p className="text-sm text-(--ink-muted)">
						{m.profile_delete_account_body()}
					</p>
				</div>
				<Button
					variant="destructive"
					size="sm"
					onClick={() => setConfirmOpen(true)}
				>
					{m.profile_delete_account_title()}
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
						? m.profile_delete_unavailable_error()
						: m.profile_generic_error(),
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
			// Past this point the deletion is committed server-side: even if
			// signOut() throws (network blip against an already-deleted session),
			// showing a retryable error would invite a pointless second attempt.
			// Redirect regardless; the full navigation resets every store.
			await signOut().catch(() => {});
			window.location.assign("/");
		} catch {
			setError(m.profile_generic_error());
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
					<DialogTitle className="font-display">
						{m.profile_delete_account_title()}
					</DialogTitle>
					<DialogDescription>
						{m.profile_delete_account_dialog_description({ email })}
					</DialogDescription>
				</DialogHeader>

				<Input
					value={typed}
					onChange={(e) => setTyped(e.target.value)}
					placeholder={email}
					aria-label={m.profile_type_email_confirm_aria()}
					autoComplete="off"
				/>
				{error && <p className="text-sm text-(--danger)">{error}</p>}

				<DialogFooter>
					<Button
						type="button"
						variant="ghost"
						onClick={() => onOpenChange(false)}
					>
						{m.form_cancel()}
					</Button>
					<Button
						type="button"
						variant="destructive"
						disabled={!matches || submitting}
						onClick={handleDelete}
					>
						{submitting
							? m.profile_deleting_ellipsis()
							: m.profile_delete_my_account()}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
