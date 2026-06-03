"use client";

import { useMemo, useState } from "react";
import { isRuleCapturable } from "../../lib/serialized-query";
import { useOwnedCardIdSet } from "../../store/userland/selectors";
import type { Binder, SerializedQuery } from "../../store/userland/types";
import {
	addCardsToBinder,
	addRuleToBinder,
	bulkAddCopies,
	useUserland,
} from "../../store/userland/userland-store";
import { BinderFormDialog } from "../binders/binder-form-dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "../ui/tooltip";
import { partitionUnowned } from "./bulk-add";

/** Props for {@link BulkAddMenu}. */
interface BulkAddMenuProps {
	/** Card IDs eligible for bulk-add; already-owned cards are filtered and counted as skipped. */
	cardIds: string[];
	/** When provided, enables the "Add smart rule to binder" item. */
	ruleQuery?: SerializedQuery | null;
	/** When non-empty, actions target this selection instead of all cardIds. */
	selectedCardIds?: string[];
	/** Trigger button label; defaults to "Add all". */
	label?: string;
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

	// BinderFormDialog state + pending action.
	const [newBinderOpen, setNewBinderOpen] = useState(false);
	const [pending, setPending] = useState<PendingAction | null>(null);

	function openNewBinder(action: PendingAction) {
		setPending(action);
		setNewBinderOpen(true);
	}

	function handleNewBinderSaved(b: Binder) {
		if (!pending) return;
		if (pending.kind === "cards") {
			void addCardsToBinder(b.id, pending.targetIds);
		} else {
			void addRuleToBinder(b.id, pending.query);
		}
		setPending(null);
	}

	async function handleCollectionAdd() {
		if (toAdd.length === 0) return;
		if (toAdd.length > 25) {
			const ok = window.confirm(
				`Add ${toAdd.length} cards to your collection?`,
			);
			if (!ok) return;
		}
		await bulkAddCopies(toAdd);
		window.alert(
			`Added ${toAdd.length}${skipped ? ` · skipped ${skipped} already owned` : ""}`,
		);
	}

	// Binder sub-items shared between both submenus.
	function binderCardItems() {
		return (
			<>
				{binderList.map((b) => (
					<DropdownMenuItem
						key={b.id}
						onSelect={() => void addCardsToBinder(b.id, targetIds)}
					>
						{b.name}
					</DropdownMenuItem>
				))}
				<DropdownMenuItem
					onSelect={() => openNewBinder({ kind: "cards", targetIds })}
				>
					＋ New binder…
				</DropdownMenuItem>
			</>
		);
	}

	function binderRuleItems(q: SerializedQuery) {
		return (
			<>
				{binderList.map((b) => (
					<DropdownMenuItem
						key={b.id}
						onSelect={() => void addRuleToBinder(b.id, q)}
					>
						{b.name}
					</DropdownMenuItem>
				))}
				<DropdownMenuItem
					onSelect={() => openNewBinder({ kind: "rule", query: q })}
				>
					＋ New binder…
				</DropdownMenuItem>
				<DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
					Matching cards always appear in this binder, including ones from
					future sets.
				</DropdownMenuLabel>
			</>
		);
	}

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						className="rounded border px-3 py-1.5 text-sm hover:bg-secondary"
					>
						{label ?? "Add all"}
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent>
					{/* Item 1: Add to collection */}
					<DropdownMenuItem
						disabled={toAdd.length === 0}
						onSelect={handleCollectionAdd}
					>
						{toAdd.length === 0
							? "All owned"
							: `Add ${toAdd.length} to collection`}
					</DropdownMenuItem>

					{/* Item 2: Add cards to binder */}
					<DropdownMenuSub>
						<DropdownMenuSubTrigger>
							Add {targetIds.length} cards to binder
						</DropdownMenuSubTrigger>
						<DropdownMenuSubContent>{binderCardItems()}</DropdownMenuSubContent>
					</DropdownMenuSub>

					{/* Item 3: Add smart rule to binder */}
					{ruleDisabled || !ruleQuery ? (
						<TooltipProvider>
							<Tooltip>
								<TooltipTrigger asChild>
									<DropdownMenuItem disabled>
										Add smart rule to binder
									</DropdownMenuItem>
								</TooltipTrigger>
								<TooltipContent>{ruleDisabledReason}</TooltipContent>
							</Tooltip>
						</TooltipProvider>
					) : (
						<DropdownMenuSub>
							<DropdownMenuSubTrigger>
								Add smart rule to binder
							</DropdownMenuSubTrigger>
							<DropdownMenuSubContent>
								{binderRuleItems(ruleQuery)}
							</DropdownMenuSubContent>
						</DropdownMenuSub>
					)}
				</DropdownMenuContent>
			</DropdownMenu>

			<BinderFormDialog
				open={newBinderOpen}
				onOpenChange={setNewBinderOpen}
				onSaved={handleNewBinderSaved}
			/>
		</>
	);
}
