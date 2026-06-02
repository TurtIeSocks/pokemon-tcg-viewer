import { Button } from "@/components/ui/button";
import { useOwnedIndex } from "../../store/userland/selectors";
import {
	addCopy,
	removeAllCopiesOfCard,
} from "../../store/userland/userland-store";
import { CopyRow } from "./copy-row";

/** Props for {@link CopyManager}. */
interface CopyManagerProps {
	/** The card ID whose copies are managed. */
	cardId: string;
	/** Optional known variant strings for the card; forwarded to each CopyRow. */
	variants?: string[];
}

/** Lists all owned copies of a card with add/remove-all controls and per-copy editing. */
export function CopyManager({ cardId, variants }: CopyManagerProps) {
	const copies = useOwnedIndex().get(cardId) ?? [];

	function handleAddCopy() {
		void addCopy(cardId);
	}

	function handleRemoveAll() {
		if (!window.confirm("Remove all copies of this card?")) return;
		void removeAllCopiesOfCard(cardId);
	}

	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-center justify-between">
				<h3 className="font-semibold">Your copies ({copies.length})</h3>
				<Button size="sm" onClick={handleAddCopy}>
					+ Add copy
				</Button>
			</div>
			<div className="flex flex-col gap-2">
				{copies.map((item) => (
					<CopyRow key={item.id} item={item} variants={variants} />
				))}
			</div>
			{copies.length > 0 && (
				<Button variant="destructive" size="sm" onClick={handleRemoveAll}>
					Remove all copies
				</Button>
			)}
		</div>
	);
}
