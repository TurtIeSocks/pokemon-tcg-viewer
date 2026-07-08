import { X } from "lucide-react";
import { type CSSProperties, useEffect } from "react";
import { createPortal } from "react-dom";
import { HoloCard, type HoloCardData, holoCardProps } from "../holo-card";

interface CardLightboxProps {
	/** Whether the enlarged view is open. Caller owns the state. */
	open: boolean;
	/** Close the enlarged view (click anywhere, the close button, or Escape). */
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
 * Fullscreen enlarged view of a card: a blurred backdrop with the interactive
 * HoloCard (foil + pointer tilt + device tilt) floating on top. Clicking ANYWHERE
 * (the card included) exits; a cursor-zoom-out on the whole surface signals that.
 *
 * PORTALED TO document.body on purpose: it is opened from inside CardCockpit,
 * whose root is a CSS `@container` (container-type), which would otherwise make
 * this `position: fixed` overlay resolve against that scrolling container instead
 * of the viewport (badly mis-positioned on the full card page). The portal escapes
 * the container so it is truly viewport-fullscreen everywhere.
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

	if (!open || typeof document === "undefined") return null;

	return createPortal(
		<div className="fixed inset-0 z-120 flex cursor-zoom-out items-center justify-center p-2 animate-in fade-in-0 duration-150 motion-reduce:animate-none sm:p-4">
			{/* Blurred fullscreen backdrop; clicking off the card dismisses. */}
			<button
				type="button"
				aria-label={`Close enlarged view of ${card.name}`}
				onClick={onClose}
				className="absolute inset-0 cursor-zoom-out border-0 bg-black/85 backdrop-blur-md"
			/>
			{/* The interactive holo card. Clicking it ALSO exits (cursor-zoom-out hints
			    this); the foil still responds to pointer move + device tilt, which are
			    move/orientation events, not clicks. */}
			<HoloCard
				{...holoCardProps(card)}
				reverse={reverse}
				size="focus"
				// Fullscreen inspection: device-orientation tilt on (mobile gyroscope
				// drives the foil); desktop keeps pointer tilt. Both gated by cardMotion.
				tilt
				onClick={onClose}
				// cursor-zoom-out! (important): the .holo-card base cursor otherwise
				// wins the layer order, hiding the click-to-exit hint on the card.
				className="relative animate-in zoom-in-95 cursor-zoom-out! duration-150 motion-reduce:animate-none"
				style={{ width: LIGHTBOX_WIDTH } as CSSProperties}
			/>
			<button
				type="button"
				aria-label="Close"
				onClick={onClose}
				className="absolute top-3 right-3 flex size-9 items-center justify-center rounded-full border border-white/10 bg-white/8 text-white/80 backdrop-blur-md transition-colors hover:bg-white/16 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--primary)"
			>
				<X className="size-5" />
			</button>
		</div>,
		document.body,
	);
}
