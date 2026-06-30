import { useRouter } from "@tanstack/react-router";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	type CardTab,
	cardRouteParams,
	cardTabLinkPropsFor,
} from "../../lib/card-route";
import type { FocusCardData } from "../../server/card-mappers";
import { useSlugIndex } from "../../store/corpus/corpus-runtime";
import { CardCockpit } from "../card/card-cockpit";
import { CardHeading } from "../card/card-info";
import { CardCrossLinks, type CrossLink } from "./cross-links";

interface CardModalProps {
	card: FocusCardData;
	crossLinks: CrossLink[];
	onClose: () => void;
	tab: CardTab;
	pending?: boolean;
}

export function CardModal({
	card,
	crossLinks,
	onClose,
	tab,
	pending,
}: CardModalProps) {
	const router = useRouter();
	const slugIndex = useSlugIndex();
	const p = slugIndex ? cardRouteParams(slugIndex, card) : null;

	const onTabChange = (next: CardTab) => {
		if (!p) return;
		void router.navigate({ ...cardTabLinkPropsFor(p, next), replace: true });
	};

	return (
		<Dialog open onOpenChange={(o) => !o && onClose()}>
			<DialogContent
				aria-describedby={undefined}
				className="max-w-4xl sm:max-w-4xl"
			>
				{/* Radix needs a DialogTitle for the dialog's accessible name; the
				    visible identity is CardHeading (shared with the dedicated page). */}
				<DialogTitle className="sr-only">
					{card.name} · {card.setName}
				</DialogTitle>
				<DialogHeader>
					<CardHeading card={card} />
				</DialogHeader>
				<div className="max-h-[90vh] overflow-y-auto">
					<CardCockpit
						card={card}
						tab={tab}
						onTabChange={onTabChange}
						pending={pending}
					/>
				</div>
				<DialogFooter>
					<CardCrossLinks links={crossLinks} />
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
