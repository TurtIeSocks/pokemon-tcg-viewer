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
			{/* Grows to its content but never past ~90dvh, then the body scrolls. No
			    title/footer bands — the identity and cross-links live inside the card
			    column (rail slots) so the modal is a balanced two-pane split with no
			    dead space. Capping at the viewport keeps the header on-screen on
			    mobile. */}
			<DialogContent
				aria-describedby={undefined}
				className="flex max-h-[90dvh] max-w-4xl flex-col sm:max-w-4xl"
			>
				{/* Radix needs a DialogTitle for the dialog's accessible name; the
				    visible identity is the CardHeading rendered in the rail below. */}
				<DialogTitle className="sr-only">
					{card.name} · {card.setName}
				</DialogTitle>
				<div className="min-h-0 flex-1 overflow-y-auto">
					<CardCockpit
						card={card}
						tab={tab}
						onTabChange={onTabChange}
						pending={pending}
						railHeader={<CardHeading card={card} />}
						railFooter={
							crossLinks.length ? (
								<CardCrossLinks links={crossLinks} />
							) : undefined
						}
					/>
				</div>
			</DialogContent>
		</Dialog>
	);
}
