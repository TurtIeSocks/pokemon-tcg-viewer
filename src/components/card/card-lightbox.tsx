import { useEffect } from "react";
import { cdnImage } from "../holo-card/cdn-image";

interface CardLightboxProps {
	/** Whether the enlarged view is open. Caller owns the state. */
	open: boolean;
	/** Close the lightbox (backdrop click or Escape). */
	onClose: () => void;
	/** Hi-res image url shown at full size. */
	src: string;
	/** Accessible name for the enlarged image. */
	alt: string;
}

/**
 * Full-bleed zoom of a card's hi-res image for close inspection. Opened from the
 * card modal's focus image; dismissed on click anywhere or Escape. Fade + zoom
 * entrance, force-disabled under prefers-reduced-motion.
 */
export function CardLightbox({ open, onClose, src, alt }: CardLightboxProps) {
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
		<button
			type="button"
			aria-label={`Close enlarged view of ${alt}`}
			onClick={onClose}
			className="fixed inset-0 z-[120] flex cursor-zoom-out items-center justify-center border-0 bg-black/85 p-4 backdrop-blur-md animate-in fade-in-0 duration-150 motion-reduce:animate-none sm:p-10"
		>
			<img
				src={cdnImage(src, { w: 1024 })}
				alt={alt}
				className="max-h-full max-w-full rounded-2xl shadow-[var(--shadow-lift)] animate-in zoom-in-95 duration-150 motion-reduce:animate-none"
			/>
		</button>
	);
}
