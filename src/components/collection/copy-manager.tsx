import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useOwnedIndex } from "../../store/userland/selectors";
import { removeAllCopiesOfCard } from "../../store/userland/userland-store";
import { CopyEditForm } from "./copy-edit-form";
import { CopyRow } from "./copy-row";

/** Props for {@link CopyManager}. */
interface CopyManagerProps {
	/** The card ID whose copies are managed. */
	cardId: string;
	/** Optional known variant strings for the card; forwarded to each CopyRow. */
	variants?: string[];
}

/** Lists all owned copies of a card with add/remove-all controls and per-copy tile editing. */
export function CopyManager({ cardId, variants }: CopyManagerProps) {
	const copies = useOwnedIndex().get(cardId) ?? [];
	const [addOpen, setAddOpen] = useState(false);

	function handleRemoveAll() {
		if (!window.confirm("Remove all copies of this card?")) return;
		void removeAllCopiesOfCard(cardId);
	}

	return (
		<div className="flex flex-col gap-4">
			{/* Header: copy count + prominent Add button */}
			<div className="flex items-center justify-between gap-2">
				<h3 className="text-sm font-semibold text-muted-foreground">
					Your copies ({copies.length})
				</h3>
				<div className="flex items-center gap-2">
					{copies.length > 0 && (
						<Button
							variant="destructive"
							size="sm"
							onClick={handleRemoveAll}
							className="gap-1.5"
							aria-label="Remove all copies"
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
							aria-label="Add copy"
						>
							<Plus className="h-4 w-4" aria-hidden="true" />
							Add copy
						</Button>
					)}
				</div>
			</div>

			{/* Create-mode form — shown when Add copy is clicked */}
			{addOpen && (
				<div className="rounded-lg border border-dashed border-border p-4">
					<p className="text-xs text-muted-foreground mb-3">New copy</p>
					<CopyEditForm
						mode="create"
						cardId={cardId}
						variants={variants}
						onSaved={() => setAddOpen(false)}
						onCancel={() => setAddOpen(false)}
					/>
				</div>
			)}

			{/* Copy tiles */}
			{copies.length === 0 && !addOpen ? (
				<p className="text-sm text-muted-foreground py-4 text-center">
					No copies yet — add one above.
				</p>
			) : (
				<div className="flex flex-col gap-2">
					{copies.map((item) => (
						<CopyRow key={item.id} item={item} variants={variants} />
					))}
				</div>
			)}
		</div>
	);
}
