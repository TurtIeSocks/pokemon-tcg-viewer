import type { SerializedQuery } from "../../store/userland/types";
import { useCardSelection } from "../islands/card-selection";
import { Button } from "../ui/button";
import { ButtonGroup } from "../ui/button-group";
import { BulkAddMenu } from "./bulk-add-menu";

/** Props for {@link SelectAndBulkAdd}. */
interface SelectAndBulkAddProps {
	/** Card IDs eligible for bulk-add; already-owned cards are filtered downstream. */
	cardIds: string[];
	/** Smart-rule query for the "Add smart rule to binder" item; null when not capturable. */
	ruleQuery?: SerializedQuery | null;
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
}: SelectAndBulkAddProps) {
	const { active, selected, toggleActive } = useCardSelection();
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
					? "Select cards"
					: selected.size > 0
						? "Clear selected"
						: "Cancel"}
			</Button>
			<BulkAddMenu
				triggerVariant="chevron"
				cardIds={cardIds}
				ruleQuery={ruleQuery}
				selectedCardIds={active ? [...selected] : undefined}
			/>
		</ButtonGroup>
	);
}
