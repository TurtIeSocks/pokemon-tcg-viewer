import { useStore } from "../../store";
import type { HoloCardData } from "../holo-card";

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
			className={[
				"inline-flex items-center justify-center",
				"w-8 h-8 rounded-full",
				"text-base font-bold text-white",
				"border cursor-pointer",
				"transition-[background,transform] duration-[120ms] ease-out",
				"hover:scale-[1.08] focus-visible:scale-[1.08] focus-visible:outline-none",
				owned
					? "bg-[rgba(80,200,120,0.92)] border-[rgba(80,200,120,1)] hover:bg-[rgba(60,180,100,1)] focus-visible:bg-[rgba(60,180,100,1)]"
					: "bg-[rgba(0,0,0,0.6)] border-[rgba(255,255,255,0.3)] hover:bg-[rgba(0,0,0,0.85)] focus-visible:bg-[rgba(0,0,0,0.85)]",
			].join(" ")}
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
