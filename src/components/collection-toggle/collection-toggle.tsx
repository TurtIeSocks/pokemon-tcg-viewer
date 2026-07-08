import type { HoloCardData } from "../holo-card";
import { useCollectionToggle } from "./use-collection-toggle";

interface CollectionToggleProps {
	card: HoloCardData;
}

const BASE_CLASSES = [
	"inline-flex items-center justify-center",
	"w-8 h-8 rounded-full",
	"text-base font-bold text-white",
	"border cursor-pointer",
	"transition-[background,transform] duration-120 ease-out",
	"hover:scale-[1.08] focus-visible:scale-[1.08] focus-visible:outline-none",
].join(" ");
const OWNED_CLASSES =
	"bg-[rgba(80,200,120,0.92)] border-[rgba(80,200,120,1)] hover:bg-[rgba(60,180,100,1)] focus-visible:bg-[rgba(60,180,100,1)]";
const UNOWNED_CLASSES =
	"bg-[rgba(0,0,0,0.6)] border-[rgba(255,255,255,0.3)] hover:bg-[rgba(0,0,0,0.85)] focus-visible:bg-[rgba(0,0,0,0.85)]";

export function CollectionToggle({ card }: CollectionToggleProps) {
	const { owned, count, activate } = useCollectionToggle(card);

	if (owned) {
		return (
			<button
				type="button"
				className={`${BASE_CLASSES} ${OWNED_CLASSES}`}
				aria-label={`Manage stacks of ${card.name}`}
				aria-pressed={true}
				onClick={activate}
			>
				✓{count}
			</button>
		);
	}

	return (
		<button
			type="button"
			className={`${BASE_CLASSES} ${UNOWNED_CLASSES}`}
			aria-label={`Add ${card.name} to Vault`}
			aria-pressed={false}
			onClick={activate}
		>
			+
		</button>
	);
}
