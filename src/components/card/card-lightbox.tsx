import { X } from "lucide-react";
import { type CSSProperties, useEffect } from "react";
import { HoloCard, type HoloCardData, holoCardProps } from "../holo-card";

interface CardLightboxProps {
	/** Whether the enlarged view is open. Caller owns the state. */
	open: boolean;
	/** Close the lightbox (backdrop click, close button, or Escape). */
	onClose: () => void;
	/** Full card data, so the zoom is an interactive holo card, not a flat image. */
	card: HoloCardData;
	/** Render the reverse-holo printing (mirrors the cockpit's printing toggle). */
	reverse?: boolean;
}

// Standard trading-card aspect (63mm x 88mm). Drive the card by WIDTH (matching how
// the rail sizes a focus HoloCard) so it grows to fill the viewport height while
// keeping its aspect, capped at the viewport width on narrow screens.
const LIGHTBOX_WIDTH = "min(94vw, calc(94vh * 63 / 88))";

/**
 * Near-fullscreen zoom of a card for close inspection. Renders the INTERACTIVE
 * HoloCard (foil + pointer tilt, gated by the cardMotion pref) sized to fill the
 * viewport at the card's aspect ratio, so a collector can admire the holo in the
 * large view. Opened from the card modal's focus image; dismissed by clicking the
 * backdrop, the close button, or Escape.
 */
export function CardLightbox({
	open,
	onClose,
	card,
	reverse,
}: CardLightboxProps) {
	useEffect(() => {
		if (!open) return;
		function onKey(e: KeyboardEvent) {
			if (e.key === "Escape") onClose();
		}
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [open, onClose]);

	if (!open) return null;

	return (
		<div className="fixed inset-0 z-[120] flex items-center justify-center p-2 animate-in fade-in-0 duration-150 motion-reduce:animate-none sm:p-4">
			{/* Backdrop behind the card: click anywhere off the card to dismiss. It is a
			    SIBLING of the card (not its parent), so working the foil with the pointer
			    never closes the view. */}
			<button
				type="button"
				aria-label={`Close enlarged view of ${card.name}`}
				onClick={onClose}
				className="absolute inset-0 cursor-zoom-out border-0 bg-black/85 backdrop-blur-md"
			/>
			{/* Interactive holo card, as large as the viewport allows at card aspect. */}
			<HoloCard
				{...holoCardProps(card)}
				reverse={reverse}
				size="focus"
				// Fullscreen inspection: turn ON device-orientation tilt (mobile
				// gyroscope drives the foil). Desktop keeps its pointer tilt; both
				// are gated by the cardMotion pref inside HoloCard.
				tilt
				className="relative animate-in zoom-in-95 duration-150 motion-reduce:animate-none"
				style={{ width: LIGHTBOX_WIDTH } as CSSProperties}
			/>
			<button
				type="button"
				aria-label="Close"
				onClick={onClose}
				className="absolute top-3 right-3 flex size-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.08] text-white/80 backdrop-blur-md transition-colors hover:bg-white/[0.16] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
			>
				<X className="size-5" />
			</button>
		</div>
	);
}
