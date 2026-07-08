"use client";

import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { m } from "@/paraglide/messages";
import type { Binder } from "../../store/userland/types";

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
	/** Invoked with the chosen binder's id; the dialog closes afterward. */
	onPick: (binderId: string) => void;
	/** Invoked when the user opts to create a new binder; the dialog closes afterward. */
	onCreateNew: () => void;
	/** Optional muted note shown beneath the list (e.g. smart-rule explainer). */
	footnote?: string;
}

/**
 * Click-reliable binder chooser. Replaces the old hover-only nested dropdown
 * submenu: a flat dialog list opens on click/tap (works on touch + trackpad),
 * lists every binder, and offers an inline "create one" escape hatch.
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
			</DialogContent>
		</Dialog>
	);
}
