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
			{/* Flex column pinned to ~90dvh: header + footer stay fixed while the
			    body scrolls. A fixed tall height (vs. grow-to-content) keeps the
			    modal roomy for short cards and, by capping at the viewport, stops
			    the header being pushed off-screen on mobile when content overflows. */}
			<DialogContent
				aria-describedby={undefined}
				className="flex h-[90dvh] max-w-4xl flex-col gap-4 sm:max-w-4xl"
			>
				{/* Radix needs a DialogTitle for the dialog's accessible name; the
				    visible identity is CardHeading (shared with the dedicated page). */}
				<DialogTitle className="sr-only">
					{card.name} · {card.setName}
				</DialogTitle>
				{/* Override the shadcn header's mobile `text-center`: the name row is a
				    flex (always left) while the meta line obeys text-align, so centering
				    splits them. Keep both left, matching desktop + the card page. */}
				<DialogHeader className="shrink-0 pr-8 text-left">
					<CardHeading card={card} />
				</DialogHeader>
				<div className="min-h-0 flex-1 overflow-y-auto">
					<CardCockpit
						card={card}
						tab={tab}
						onTabChange={onTabChange}
						pending={pending}
					/>
				</div>
				<DialogFooter className="shrink-0">
					<CardCrossLinks links={crossLinks} />
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
