import { useRouter } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
	type CardTab,
	cardRouteParams,
	cardTabLinkPropsFor,
} from "../../lib/card-route";
import type { FocusCardData } from "../../server/card-mappers";
import { useSlugIndex } from "../../store/corpus/corpus-runtime";
import { CardCockpit } from "../card/card-cockpit";
import type { CrossLink } from "./cross-links";

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
				className="max-w-4xl overflow-hidden p-0 sm:max-w-4xl"
			>
				<DialogTitle className="sr-only">{card.name}</DialogTitle>
				<div className="max-h-[90vh] overflow-y-auto">
					<CardCockpit
						card={card}
						crossLinks={crossLinks}
						tab={tab}
						onTabChange={onTabChange}
						pending={pending}
					/>
				</div>
			</DialogContent>
		</Dialog>
	);
}
