import type { ListContext, ListSearch } from "../../lib/card-query";
import { m } from "../../paraglide/messages";
import { useFilteredCardIds } from "../../store/corpus/use-filtered-card-ids";
import type { SerializedQuery } from "../../store/userland/types";
import { useCardSelection } from "../islands/card-selection";
import { Button } from "../ui/button";
import { ButtonGroup } from "../ui/button-group";
import { BulkAddMenu } from "./bulk-add-menu";

/** Props for {@link SelectAndBulkAdd}. */
interface SelectAndBulkAddProps {
	/** Card IDs eligible for bulk-add; the SSR seed / fallback (full unfiltered set). */
	cardIds: string[];
	/** Smart-rule query for the "Add smart rule to binder" item; null when not capturable. */
	ruleQuery?: SerializedQuery | null;
	/**
	 * Active list search + context. When provided, the bulk-add target is the
	 * filtered result of the same corpus query the grid runs — so "Add all" / "Add
	 * N cards to binder" respect the active filters instead of the whole set. Omit
	 * on filterless lists (e.g. a series page) to target `cardIds` as-is.
	 */
	search?: ListSearch;
	context?: ListContext;
}

/**
 * Split button pairing the multi-select toggle with the {@link BulkAddMenu}
 * dropdown. The toggle label reflects selection state read from the surrounding
 * {@link CardSelectionProvider}: "Select cards" when off, "Clear selected" once
 * something is picked, "Cancel" when on but empty. Shared by every card-list
 * page so the toggle wording and select-mode wiring live in one place.
 */
export function SelectAndBulkAdd({
	cardIds,
	ruleQuery = null,
	search,
	context,
}: SelectAndBulkAddProps) {
	const { active, selected, toggleActive } = useCardSelection();
	// Resolve the "All" target to what the active filters actually show.
	const targetCardIds = useFilteredCardIds(search, context, cardIds);
	return (
		<ButtonGroup>
			<Button
				type="button"
				variant="outline"
				size="sm"
				aria-pressed={active}
				onClick={toggleActive}
			>
				{!active
					? m.vault_select_cards()
					: selected.size > 0
						? m.vault_clear_selected()
						: m.form_cancel()}
			</Button>
			<BulkAddMenu
				triggerVariant="chevron"
				cardIds={targetCardIds}
				ruleQuery={ruleQuery}
				selectedCardIds={active ? [...selected] : undefined}
			/>
		</ButtonGroup>
	);
}
