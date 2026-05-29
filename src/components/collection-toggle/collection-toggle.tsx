import { useStore } from "../../store";
import type { HoloCardData } from "../holo-card";
import "./collection-toggle.css";

interface CollectionToggleProps {
	card: HoloCardData;
}

export function CollectionToggle({ card }: CollectionToggleProps) {
	const owned = useStore((s) => !!s.owned[card.id]);
	const add = useStore((s) => s.addToCollection);
	const remove = useStore((s) => s.removeFromCollection);

	const label = owned
		? `Remove ${card.name} from collection`
		: `Add ${card.name} to collection`;

	return (
		<button
			type="button"
			className={`collection-toggle${owned ? " owned" : ""}`}
			aria-label={label}
			aria-pressed={owned}
			onClick={(e) => {
				// Prevent the card-body onClick (navigate to /card/:id) from firing.
				// The Phase 2 #2a guard in <CardGrid> and <PokemonTimeline> reads
				// e.defaultPrevented on the bubbled event.
				e.preventDefault();
				if (owned) remove(card.id);
				else add(card);
			}}
		>
			{owned ? "✓" : "+"}
		</button>
	);
}
