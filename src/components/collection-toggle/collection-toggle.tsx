import { useState } from "react";
import { useIsOwned, useOwnedCount } from "../../store/userland/selectors";
import { addCopy } from "../../store/userland/userland-store";
import { CopyManager } from "../collection/copy-manager";
import type { HoloCardData } from "../holo-card";
import { Dialog, DialogContent, DialogTitle } from "../ui/dialog";

interface CollectionToggleProps {
	card: HoloCardData;
}

export function CollectionToggle({ card }: CollectionToggleProps) {
	const owned = useIsOwned(card.id);
	const count = useOwnedCount(card.id);
	const [open, setOpen] = useState(false);

	const baseClasses = [
		"inline-flex items-center justify-center",
		"w-8 h-8 rounded-full",
		"text-base font-bold text-white",
		"border cursor-pointer",
		"transition-[background,transform] duration-[120ms] ease-out",
		"hover:scale-[1.08] focus-visible:scale-[1.08] focus-visible:outline-none",
	].join(" ");

	const ownedClasses =
		"bg-[rgba(80,200,120,0.92)] border-[rgba(80,200,120,1)] hover:bg-[rgba(60,180,100,1)] focus-visible:bg-[rgba(60,180,100,1)]";
	const unownedClasses =
		"bg-[rgba(0,0,0,0.6)] border-[rgba(255,255,255,0.3)] hover:bg-[rgba(0,0,0,0.85)] focus-visible:bg-[rgba(0,0,0,0.85)]";

	if (owned) {
		return (
			<Dialog open={open} onOpenChange={setOpen}>
				<button
					type="button"
					className={`${baseClasses} ${ownedClasses}`}
					aria-label={`Manage copies of ${card.name}`}
					aria-pressed={true}
					onClick={(e) => {
						e.preventDefault();
						setOpen(true);
					}}
				>
					✓{count}
				</button>
				<DialogContent>
					<DialogTitle>{card.name} — Copies</DialogTitle>
					<CopyManager cardId={card.id} variants={card.variants} />
				</DialogContent>
			</Dialog>
		);
	}

	return (
		<button
			type="button"
			className={`${baseClasses} ${unownedClasses}`}
			aria-label={`Add ${card.name} to collection`}
			aria-pressed={false}
			onClick={(e) => {
				e.preventDefault();
				void addCopy(card.id);
			}}
		>
			+
		</button>
	);
}
