import { Combine, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { CardVariant } from "../../lib/card-variants";
import { useOwnedIndex } from "../../store/userland/selectors";
import {
	mergeDuplicateStacks,
	removeAllStacksOfCard,
	stackIdentityKey,
} from "../../store/userland/userland-store";
import { StackEditForm } from "./stack-edit-form";
import { StackRow } from "./stack-row";

/** Props for {@link StackManager}. */
interface StackManagerProps {
	/** The card ID whose stacks are managed. */
	cardId: string;
	/** Optional known variant strings for the card; forwarded to each StackRow. */
	variants?: string[];
	/** Exact printings from the live card detail; forwarded to the create-mode form. */
	variantsDetailed?: CardVariant[];
}

/** Lists all owned stacks of a card with add/remove-all controls and per-stack tile editing. */
export function StackManager({
	cardId,
	variants,
	variantsDetailed,
}: StackManagerProps) {
	const stacks = useOwnedIndex().get(cardId) ?? [];
	const [addOpen, setAddOpen] = useState(false);
	const hasDuplicates =
		new Set(stacks.map(stackIdentityKey)).size < stacks.length;

	function handleRemoveAll() {
		if (!window.confirm("Remove all copies of this card?")) return;
		void removeAllStacksOfCard(cardId);
	}

	return (
		<div className="flex flex-col gap-4">
			{/* Header: stack count + prominent Add button */}
			<div className="flex flex-wrap items-center justify-between gap-2">
				<h3 className="flex items-center gap-2 font-display text-[19px] font-medium text-[var(--ink)]">
					Your cards
					<Badge variant="default" className="font-mono text-[11px]">
						{stacks.length}
					</Badge>
				</h3>
				<div className="flex items-center gap-2">
					{hasDuplicates && (
						<Button
							variant="ghost"
							size="sm"
							onClick={() => void mergeDuplicateStacks(cardId)}
							className="gap-1.5"
							aria-label="Merge duplicates"
						>
							<Combine className="h-4 w-4" aria-hidden="true" />
							Merge dupes
						</Button>
					)}
					{stacks.length > 0 && (
						<Button
							variant="destructive"
							size="sm"
							onClick={handleRemoveAll}
							className="gap-1.5"
							aria-label="Remove all"
						>
							<Trash2 className="h-4 w-4" aria-hidden="true" />
							Remove all
						</Button>
					)}
					{!addOpen && (
						<Button
							size="sm"
							onClick={() => setAddOpen(true)}
							className="gap-1.5"
							aria-label="Add card"
						>
							<Plus className="h-4 w-4" aria-hidden="true" />
							Add card
						</Button>
					)}
				</div>
			</div>

			{/* Create-mode form — shown when Add stack is clicked */}
			{addOpen && (
				<div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--glass)] p-4">
					<p className="text-xs text-[var(--faint)] mb-3">New card</p>
					<StackEditForm
						mode="create"
						cardId={cardId}
						variants={variants}
						variantsDetailed={variantsDetailed}
						onSaved={() => setAddOpen(false)}
						onCancel={() => setAddOpen(false)}
					/>
				</div>
			)}

			{/* Stack tiles */}
			{stacks.length === 0 && !addOpen ? (
				<p className="text-sm text-[var(--ink-muted)] py-4 text-center">
					No cards yet. Add one above.
				</p>
			) : (
				<div className="flex flex-col gap-2">
					{stacks.map((item) => (
						<StackRow key={item.id} item={item} variants={variants} />
					))}
				</div>
			)}
		</div>
	);
}
