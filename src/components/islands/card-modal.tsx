import { useRouter } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
	cardManageLinkPropsFor,
	cardModalLinkPropsFor,
	cardRouteParams,
} from "../../lib/card-route";
import type { FocusCardData } from "../../server/card-mappers";
import { useSlugIndex } from "../../store/corpus/corpus-runtime";
import { CardDetail } from "../card/card-detail";
import { toHoloCardData } from "../card/to-holo";
import { CardCollectionManager } from "../collection/card-collection-manager";
import type { CrossLink } from "./cross-links";

interface CardModalProps {
	card: FocusCardData;
	crossLinks: CrossLink[];
	onClose: () => void;
	/**
	 * When true, slides to the manage (collection) face.
	 * Both faces pop one history entry on back/close via `onClose`.
	 */
	manage?: boolean;
}

/**
 * In-app card overlay: two faces (detail + manager) in a horizontal slide
 * track. Sliding is driven by the `manage` prop with a CSS transition so the
 * same modal instance transitions between faces without remounting.
 *
 * Face switching uses `replace: true` so navigating detail ↔ manage does NOT
 * grow the history stack — the modal remains one entry and the Dialog X /
 * `onClose` = `router.history.back()` returns to the origin grid/vault.
 *
 * Accessibility: the off-screen panel carries `aria-hidden` and
 * `pointer-events-none` so keyboard/AT cannot reach it while inactive.
 * `motion-reduce:transition-none` (Tailwind) respects the OS reduced-motion
 * preference.
 */
export function CardModal({
	card,
	crossLinks,
	onClose,
	manage,
}: CardModalProps) {
	const holo = toHoloCardData(card);
	const isManage = Boolean(manage);
	const router = useRouter();
	const slugIndex = useSlugIndex();

	// Resolve route params once; null when corpus/sets not yet loaded.
	const p = slugIndex ? cardRouteParams(slugIndex, card) : null;

	/** Switch TO the manage face (replace — no new history entry). */
	const handleManage = p
		? () => {
				void router.navigate({
					...cardManageLinkPropsFor(p),
					replace: true,
				});
			}
		: undefined;

	/** Switch BACK to the detail face (replace — no new history entry). */
	const handleBack = p
		? () => {
				void router.navigate({
					...cardModalLinkPropsFor(p),
					replace: true,
				});
			}
		: undefined;

	return (
		<Dialog open onOpenChange={(o) => !o && onClose()}>
			<DialogContent
				aria-describedby={undefined}
				className="max-w-4xl overflow-hidden border-white/10 bg-[#0d0d0f] p-0 sm:max-w-4xl"
				/**
				 * No overflow-y-auto here — each panel owns its own scroll so only
				 * the active face scrolls. The outer container is clipping-only.
				 */
			>
				<DialogTitle className="sr-only">{card.name}</DialogTitle>

				{/*
				 * Horizontal slide track. The inner flex row holds two equal-width
				 * panels. `translateX(-50%)` shifts to panel B (manager).
				 */}
				<div
					className={[
						"flex w-[200%] items-start",
						"transition-transform duration-300 ease-out",
						"motion-reduce:transition-none",
						isManage ? "-translate-x-1/2" : "translate-x-0",
					].join(" ")}
					aria-live="polite"
				>
					{/* Panel A — Card Detail */}
					<div
						className="w-1/2 max-h-[90vh] overflow-y-auto"
						aria-hidden={isManage || undefined}
						inert={isManage || undefined}
					>
						<CardDetail
							card={card}
							crossLinks={crossLinks}
							onManage={handleManage}
						/>
					</div>

					{/* Panel B — Collection Manager */}
					<div
						className="w-1/2 max-h-[90vh] overflow-y-auto"
						aria-hidden={!isManage || undefined}
						inert={!isManage || undefined}
					>
						<CardCollectionManager
							cardId={card.id}
							cardName={card.name}
							setName={card.setName}
							cardNumber={card.cardNumber}
							imageUrl={card.imageUrl}
							variants={holo.variants}
							onBack={handleBack ?? onClose}
						/>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
