"use client";

import { ChevronDown } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { isRuleCapturable } from "../../lib/serialized-query";
import { m } from "../../paraglide/messages";
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
		? m.vault_bulk_add_rule_disabled_clear_selection()
		: m.vault_bulk_add_rule_disabled_apply_filter();

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
				m.vault_bulk_add_confirm({ count: toAdd.length }),
			);
			if (!ok) return;
		}
		await bulkAddStacks(toAdd);
		window.alert(
			`${m.vault_bulk_add_added({ count: toAdd.length })}${skipped ? ` · ${m.vault_bulk_add_skipped({ count: skipped })}` : ""}`,
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
									? m.vault_bulk_add_selected({
											count: selectedCardIds?.length ?? 0,
										})
									: (label ?? m.vault_bulk_add_all())
							}
						>
							{inSelectMode
								? (selectedCardIds?.length ?? 0)
								: m.vault_mode_all()}
							<ChevronDown />
						</Button>
					) : (
						<Button type="button" variant="secondary" size="sm">
							{label ?? m.vault_bulk_add_all()}
						</Button>
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
							? m.vault_bulk_add_all_owned()
							: m.vault_bulk_add_to_collection({ count: toAdd.length })}
					</DropdownMenuItem>

					{/* Item 2: Add cards to binder — opens a click-reliable picker
					    dialog (the old nested submenu only opened on hover). */}
					<DropdownMenuItem onSelect={() => setPicker("cards")}>
						{m.vault_bulk_add_cards_to_binder_item({
							count: targetIds.length,
						})}
					</DropdownMenuItem>

					{/* Item 3: Add smart rule to binder. When disabled, the reason is
					    shown inline — a disabled item has `pointer-events:none`, so a
					    hover tooltip on it would never fire. */}
					{ruleDisabled || !ruleQuery ? (
						<>
							<DropdownMenuItem disabled>
								{m.vault_bulk_add_smart_rule_item()}
							</DropdownMenuItem>
							<DropdownMenuLabel className="-mt-1 text-xs text-(--ink-muted) font-normal">
								{ruleDisabledReason}
							</DropdownMenuLabel>
						</>
					) : (
						<DropdownMenuItem onSelect={() => setPicker("rule")}>
							{m.vault_bulk_add_smart_rule_item()}
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
				title={m.vault_bulk_add_to_binder_title({ count: targetIds.length })}
				description={m.vault_bulk_add_to_binder_description()}
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
					title={m.vault_bulk_add_smart_rule_title()}
					description={m.vault_bulk_add_smart_rule_description()}
					footnote={m.vault_bulk_add_smart_rule_footnote()}
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
