import { useIsOwned } from "../../store/userland/selectors";
import {
	addCopy,
	removeAllCopiesOfCard,
} from "../../store/userland/userland-store";
import type { HoloCardData } from "../holo-card";

interface CollectionToggleProps {
	card: HoloCardData;
}

export function CollectionToggle({ card }: CollectionToggleProps) {
	const owned = useIsOwned(card.id);

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
				e.preventDefault();
				if (owned) void removeAllCopiesOfCard(card.id);
				else void addCopy(card.id);
			}}
		>
			{owned ? "✓" : "+"}
		</button>
	);
}
