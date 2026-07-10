"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { m } from "@/paraglide/messages";
import { useBindersForCard } from "../../store/userland/selectors";
import type { Binder } from "../../store/userland/types";
import {
	addCardsToBinder,
	removeCardFromBinder,
} from "../../store/userland/userland-store";

/** Props for {@link BinderPickerDialog}. */
interface BinderPickerDialogProps {
	/** Whether the dialog is open. */
	open: boolean;
	/** Called to request open-state change; caller owns the state. */
	onOpenChange: (open: boolean) => void;
	/** Heading describing the action (e.g. "Add 5 cards to a binder"). */
	title: string;
	/** Optional sub-heading under the title. */
	description?: string;
	/** Binders to choose from. */
	binders: Binder[];
	/** Invoked with the chosen binder's id; the dialog closes afterward. Ignored in membership mode. */
	onPick: (binderId: string) => void;
	/** Invoked when the user opts to create a new binder; the dialog closes afterward. */
	onCreateNew: () => void;
	/** Optional muted note shown beneath the list (e.g. smart-rule explainer). */
	footnote?: string;
	/**
	 * Opt-in MEMBERSHIP mode. When set to a cardId, each binder row becomes a
	 * checkbox reflecting whether that card is currently in the binder; toggling
	 * on/off calls {@link addCardsToBinder}/{@link removeCardFromBinder} directly
	 * and the dialog stays open for multi-edit (`onPick` is ignored). When ABSENT
	 * (the default), the dialog is the add-only chooser used by bulk callers —
	 * clicking a binder invokes `onPick` and closes.
	 */
	membershipCardId?: string;
}

/**
 * Click-reliable binder chooser. Replaces the old hover-only nested dropdown
 * submenu: a flat dialog list opens on click/tap (works on touch + trackpad),
 * lists every binder, and offers an inline "create one" escape hatch.
 *
 * Two modes, one component:
 * - **Add-only** (default) — every row is a button; clicking it calls `onPick`
 *   and closes. Used by bulk callers (e.g. BulkAddMenu) whose behavior is
 *   unchanged by the membership feature.
 * - **Membership** (opt-in via {@link BinderPickerDialogProps.membershipCardId})
 *   — every row is a checkbox reflecting live membership; toggling adds/removes
 *   the card and the list stays open. The reliable per-card membership editor.
 */
export function BinderPickerDialog({
	open,
	onOpenChange,
	title,
	description,
	binders,
	onPick,
	onCreateNew,
	footnote,
	membershipCardId,
}: BinderPickerDialogProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle className="font-display">{title}</DialogTitle>
					{description ? (
						<DialogDescription>{description}</DialogDescription>
					) : null}
				</DialogHeader>

				{membershipCardId != null ? (
					// Mount the derive-heavy membership hook ONLY while the dialog is open.
					open ? (
						<BinderMembershipList
							cardId={membershipCardId}
							binders={binders}
							onCreateNew={onCreateNew}
							onOpenChange={onOpenChange}
							footnote={footnote}
						/>
					) : null
				) : (
					<div className="flex flex-col gap-1">
						{binders.length === 0 ? (
							<p className="px-1 py-2 text-sm text-(--ink-muted)">
								{m.binder_picker_empty()}
							</p>
						) : (
							binders.map((b) => (
								<Button
									key={b.id}
									type="button"
									variant="ghost"
									className="justify-start"
									onClick={() => {
										onPick(b.id);
										onOpenChange(false);
									}}
								>
									{b.name}
								</Button>
							))
						)}
						<Button
							type="button"
							variant="outline"
							className="justify-start"
							onClick={() => {
								onCreateNew();
								onOpenChange(false);
							}}
						>
							{m.binder_picker_create_new()}
						</Button>
						{footnote ? (
							<p className="px-1 pt-1 text-xs text-(--ink-muted)">{footnote}</p>
						) : null}
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}

/** Props for {@link BinderMembershipList}. */
interface BinderMembershipListProps {
	/** The card whose binder membership is being edited. */
	cardId: string;
	/** Binders to list as toggleable membership rows. */
	binders: Binder[];
	/** Escape hatch to create a new binder (closes the dialog). */
	onCreateNew: () => void;
	/** Close the dialog (used by the create-new escape hatch). */
	onOpenChange: (open: boolean) => void;
	/** Optional muted note shown beneath the list. */
	footnote?: string;
}

/**
 * The membership-mode body: one checkbox per binder, reflecting whether `cardId`
 * is currently a member (rule match OR manual include, minus excludes). Mounted
 * only while the dialog is open — {@link useBindersForCard} derives over every
 * binder × its rules across all loaded regions, so it must not run on closed
 * dialogs or per grid tile.
 */
function BinderMembershipList({
	cardId,
	binders,
	onCreateNew,
	onOpenChange,
	footnote,
}: BinderMembershipListProps) {
	const memberIds = useBindersForCard(cardId);
	const memberSet = useMemo(() => new Set(memberIds), [memberIds]);

	return (
		<div className="flex flex-col gap-1">
			{binders.length === 0 ? (
				<p className="px-1 py-2 text-sm text-(--ink-muted)">
					{m.binder_picker_empty()}
				</p>
			) : (
				binders.map((b) => {
					const checked = memberSet.has(b.id);
					const rowId = `binder-member-${b.id}`;
					return (
						<div
							key={b.id}
							className="flex items-center gap-2 rounded-(--r-control) px-2 py-1.5 transition-colors hover:bg-white/5"
						>
							<Checkbox
								id={rowId}
								aria-label={b.name}
								checked={checked}
								onCheckedChange={(v) => {
									if (v === true) void addCardsToBinder(b.id, [cardId]);
									else void removeCardFromBinder(b.id, cardId);
								}}
							/>
							<label
								htmlFor={rowId}
								className="flex-1 cursor-pointer text-sm text-(--ink)"
							>
								{b.name}
							</label>
						</div>
					);
				})
			)}
			<Button
				type="button"
				variant="outline"
				className="mt-1 justify-start"
				onClick={() => {
					onCreateNew();
					onOpenChange(false);
				}}
			>
				{m.binder_picker_create_new()}
			</Button>
			{footnote ? (
				<p className="px-1 pt-1 text-xs text-(--ink-muted)">{footnote}</p>
			) : null}
		</div>
	);
}
