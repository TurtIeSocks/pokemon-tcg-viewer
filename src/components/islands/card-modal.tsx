import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { FocusCardData } from "../../server/card-mappers";
import { CardDetail } from "../card/card-detail";
import type { CrossLink } from "./cross-links";

/** In-app card overlay: the shared CardDetail body inside a Dialog. */
export function CardModal({
	card,
	crossLinks,
	onClose,
}: {
	card: FocusCardData;
	crossLinks: CrossLink[];
	onClose: () => void;
}) {
	return (
		<Dialog open onOpenChange={(o) => !o && onClose()}>
			<DialogContent
				aria-describedby={undefined}
				className="max-h-[90vh] max-w-4xl overflow-y-auto border-white/10 bg-[#0d0d0f] p-0 sm:max-w-4xl"
			>
				<DialogTitle className="sr-only">{card.name}</DialogTitle>
				<CardDetail card={card} crossLinks={crossLinks} />
			</DialogContent>
		</Dialog>
	);
}
