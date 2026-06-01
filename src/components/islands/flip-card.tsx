import { type ReactNode, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/** Local copy of the official TCG card back (public/card-back.jpg). */
const CARD_BACK_SRC = "/card-back.jpg";

// Only show the back + flip for images still loading after this long. Cached /
// fast images (the common case) never show a back — the page crossfade covers
// them. Cold-cache / slow images get the back as a placeholder, then flip in.
const SLOW_MS = 250;

type Phase = "loading" | "back" | "flipping" | "done";

interface FlipCardProps {
	/** The front image to watch (the one the card actually displays). */
	imageUrl: string;
	children: ReactNode;
}

/**
 * Wraps a card. The front (`children`) is always rendered; while its image is
 * still loading past SLOW_MS, a card-back overlay covers it, then flips away to
 * reveal the front once the image is ready. Fast/cached images skip the overlay
 * entirely. Only the overlay rotates, so the holo card never composes with the
 * flip's 3D transform. The fixed aspect keeps the back card-sized even before
 * the front image has dimensions (and lets Virtuoso measure a stable row).
 */
export function FlipCard({ imageUrl, children }: FlipCardProps) {
	const [phase, setPhase] = useState<Phase>("loading");

	useEffect(() => {
		let cancelled = false;
		const img = new Image();
		const onReady = () => {
			if (cancelled) return;
			setPhase((p) => {
				if (p !== "back") return "done"; // loaded fast → no flip
				const reduce = window.matchMedia?.(
					"(prefers-reduced-motion: reduce)",
				).matches;
				return reduce ? "done" : "flipping"; // was showing the back → flip it away
			});
		};
		img.onload = onReady;
		img.onerror = onReady; // reveal even if the image fails
		img.src = imageUrl;
		if (img.complete) {
			setPhase("done");
			return;
		}
		const timer = setTimeout(() => {
			if (!cancelled) setPhase((p) => (p === "loading" ? "back" : p));
		}, SLOW_MS);
		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
	}, [imageUrl]);

	const showBack = phase === "back" || phase === "flipping";

	return (
		<div className="relative aspect-[5/7] w-full [perspective:900px]">
			{children}
			{showBack && (
				<div
					aria-hidden="true"
					onTransitionEnd={() => setPhase("done")}
					className={cn(
						"absolute inset-0 [backface-visibility:hidden] transition-transform duration-500 [transition-timing-function:cubic-bezier(0.34,1.4,0.64,1)]",
						phase === "flipping"
							? "[transform:rotateY(180deg)]"
							: "[transform:rotateY(0deg)]",
					)}
				>
					<img
						src={CARD_BACK_SRC}
						alt=""
						className="size-full rounded-lg object-cover"
					/>
				</div>
			)}
		</div>
	);
}
