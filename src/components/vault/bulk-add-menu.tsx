"use client";

import { ChevronDown } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { isRuleCapturable } from "../../lib/serialized-query";
import { useOwnedCardIdSet } from "../../store/userland/selectors";
import type { Binder, SerializedQuery } from "../../store/userland/types";
import {
	addCardsToBinder,
	addRuleToBinder,
	bulkAddStacks,
	useUserland,
} from "../../store/userland/userland-store";
import { BinderFormDialog } from "../binders/binder-form-dialog";
import { BinderPickerDialog } from "../binders/binder-picker-dialog";
import { Button } from "../ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { partitionUnowned } from "./bulk-add";

/** Props for {@link BulkAddMenu}. */
interface BulkAddMenuProps {
	/** Card IDs eligible for bulk-add; already-owned cards are filtered and counted as skipped. */
	cardIds: string[];
	/** When provided, enables the "Add smart rule to binder" item. */
	ruleQuery?: SerializedQuery | null;
	/** When non-empty, actions target this selection instead of all cardIds. */
	selectedCardIds?: string[];
	/** Trigger button label; defaults to "Add all". In `chevron` mode it becomes the icon button's accessible name. */
	label?: string;
	/**
	 * Trigger appearance. `pill` (default) is the standalone "Add all" text button.
	 * `chevron` is an icon-only outline button for composing inside a `<ButtonGroup>` split button.
	 */
	triggerVariant?: "pill" | "chevron";
}

/** Pending action to run after a new binder is created. */
type PendingAction =
	| { kind: "cards"; targetIds: string[] }
	| { kind: "rule"; query: SerializedQuery };

/** Dropdown menu for adding a batch of cards to the collection or to a binder. */
export function BulkAddMenu({
	cardIds,
	ruleQuery,
	selectedCardIds,
	label,
	triggerVariant = "pill",
}: BulkAddMenuProps) {
	const ownedSet = useOwnedCardIdSet();
	const binders = useUserland((s) => s.binders);

	const inSelectMode = (selectedCardIds?.length ?? 0) > 0;

	// Target set: selection if in select mode, otherwise all cardIds.
	const targetIds = useMemo(
		() => (inSelectMode ? (selectedCardIds ?? []) : cardIds),
		[inSelectMode, selectedCardIds, cardIds],
	);

	const { toAdd, skipped } = useMemo(
		() => partitionUnowned(targetIds, ownedSet),
		[targetIds, ownedSet],
	);

	const binderList = useMemo(() => Object.values(binders), [binders]);

	// Smart-rule submenu enabled iff not in select mode AND ruleQuery is capturable.
	const ruleDisabled =
		inSelectMode || !ruleQuery || !isRuleCapturable(ruleQuery);
	const ruleDisabledReason = inSelectMode
		? "Clear your selection to save a rule"
		: "Apply a filter/search to save it as a rule";

	// Which binder-picker dialog is open (null = none). Opening it on click —
	// rather than the old hover-only nested submenu — is what makes binder
	// selection work on click/tap/trackpad.
	const [picker, setPicker] = useState<null | "cards" | "rule">(null);

	// BinderFormDialog open state + the pending action. `pending` is only read
	// inside handlers (never rendered), so a ref avoids two wasted re-renders.
	const [newBinderOpen, setNewBinderOpen] = useState(false);
	const pendingRef = useRef<PendingAction | null>(null);

	function openNewBinder(action: PendingAction) {
		pendingRef.current = action;
		setNewBinderOpen(true);
	}

	function handleNewBinderSaved(b: Binder) {
		const pending = pendingRef.current;
		if (!pending) return;
		if (pending.kind === "cards") {
			void addCardsToBinder(b.id, pending.targetIds);
		} else {
			void addRuleToBinder(b.id, pending.query);
		}
		pendingRef.current = null;
	}

	async function handleCollectionAdd() {
		if (toAdd.length === 0) return;
		if (toAdd.length > 25) {
			const ok = window.confirm(
				`Add ${toAdd.length} cards to your collection?`,
			);
			if (!ok) return;
		}
		await bulkAddStacks(toAdd);
		window.alert(
			`Added ${toAdd.length}${skipped ? ` · skipped ${skipped} already owned` : ""}`,
		);
	}

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					{triggerVariant === "chevron" ? (
						<Button
							type="button"
							variant="outline"
							size="sm"
							aria-label={
								inSelectMode
									? `Add ${selectedCardIds?.length ?? 0} selected`
									: (label ?? "Add all")
							}
						>
							{inSelectMode ? (selectedCardIds?.length ?? 0) : "All"}
							<ChevronDown />
						</Button>
					) : (
						<button
							type="button"
							className="rounded-[var(--r-pill)] border border-[var(--border)] bg-[var(--glass)] px-3 py-1.5 text-sm text-[var(--ink)] hover:bg-white/[0.09] transition-colors"
						>
							{label ?? "Add all"}
						</button>
					)}
				</DropdownMenuTrigger>
				<DropdownMenuContent
					align={triggerVariant === "chevron" ? "end" : undefined}
				>
					{/* Item 1: Add to collection */}
					<DropdownMenuItem
						disabled={toAdd.length === 0}
						onSelect={handleCollectionAdd}
					>
						{toAdd.length === 0
							? "All owned"
							: `Add ${toAdd.length} to collection`}
					</DropdownMenuItem>

					{/* Item 2: Add cards to binder — opens a click-reliable picker
					    dialog (the old nested submenu only opened on hover). */}
					<DropdownMenuItem onSelect={() => setPicker("cards")}>
						Add {targetIds.length} cards to binder
					</DropdownMenuItem>

					{/* Item 3: Add smart rule to binder. When disabled, the reason is
					    shown inline — a disabled item has `pointer-events:none`, so a
					    hover tooltip on it would never fire. */}
					{ruleDisabled || !ruleQuery ? (
						<>
							<DropdownMenuItem disabled>
								Add smart rule to binder
							</DropdownMenuItem>
							<DropdownMenuLabel className="-mt-1 text-xs text-[var(--ink-muted)] font-normal">
								{ruleDisabledReason}
							</DropdownMenuLabel>
						</>
					) : (
						<DropdownMenuItem onSelect={() => setPicker("rule")}>
							Add smart rule to binder
						</DropdownMenuItem>
					)}
				</DropdownMenuContent>
			</DropdownMenu>

			{/* Click-reliable binder choosers, opened from the menu items above. */}
			<BinderPickerDialog
				open={picker === "cards"}
				onOpenChange={(o) => {
					if (!o) setPicker(null);
				}}
				title={`Add ${targetIds.length} ${targetIds.length === 1 ? "card" : "cards"} to a binder`}
				description="Pick a binder to add these cards to."
				binders={binderList}
				onPick={(id) => void addCardsToBinder(id, targetIds)}
				onCreateNew={() => openNewBinder({ kind: "cards", targetIds })}
			/>
			{ruleQuery && !ruleDisabled ? (
				<BinderPickerDialog
					open={picker === "rule"}
					onOpenChange={(o) => {
						if (!o) setPicker(null);
					}}
					title="Save as a smart rule"
					description="Pick a binder to save this filter as a smart rule."
					footnote="Matching cards always appear in this binder, including ones from future sets."
					binders={binderList}
					onPick={(id) => void addRuleToBinder(id, ruleQuery)}
					onCreateNew={() => openNewBinder({ kind: "rule", query: ruleQuery })}
				/>
			) : null}

			<BinderFormDialog
				open={newBinderOpen}
				onOpenChange={setNewBinderOpen}
				onSaved={handleNewBinderSaved}
			/>
		</>
	);
}
