import { type ReactNode, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { CARD_BACK_SRC } from "../shell/list-page-skeleton";

// Card ids that have already flipped this session. Stops Virtuoso from
// re-flipping a card every time it recycles on scroll, while cards from a freshly
// navigated set (new ids) still flip in.
const flippedIds = new Set<string>();

const isTestEnv =
	typeof process !== "undefined" && process.env.NODE_ENV === "test";

// Cards present on first paint (the SSR seed) render their fronts so the markup
// stays crawlable and works without JS; only cards that mount later — i.e. after
// a client navigation — flip in. This flips true one frame after the client
// loads, by which point the initial cards have already rendered as fronts.
let appReady = false;
if (typeof window !== "undefined") {
	requestAnimationFrame(() => {
		appReady = true;
	});
}

interface FlipCardProps {
	cardId: string;
	/** Front image to preload; the flip fires once it has loaded. */
	imageUrl: string;
	name: string;
	children: ReactNode;
}

/**
 * Shows the card back, then flips 180° on the Y axis (spring overshoot) to reveal
 * the front once its image has loaded. After the flip the wrapper is dropped and
 * `children` (the interactive HoloCard) render directly, so the holo tilt never
 * has to compose with the flip's 3D transform.
 */
export function FlipCard({ cardId, imageUrl, name, children }: FlipCardProps) {
	// Render the front immediately (no flip) for SSR/first-paint cards, cards that
	// already flipped this session, and tests (happy-dom has no real image loads).
	const instant = isTestEnv || !appReady || flippedIds.has(cardId);
	const [flipped, setFlipped] = useState(instant);
	const [revealed, setRevealed] = useState(instant);

	useEffect(() => {
		if (instant) return;
		if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
			flippedIds.add(cardId);
			setRevealed(true);
			return;
		}
		let cancelled = false;
		const flip = () => {
			if (!cancelled) setFlipped(true);
		};
		const img = new Image();
		img.onload = flip;
		img.onerror = flip; // reveal even if the front image fails to load
		img.src = imageUrl;
		if (img.complete) flip();
		return () => {
			cancelled = true;
		};
	}, [instant, cardId, imageUrl]);

	if (revealed) return <>{children}</>;

	return (
		<div className="[perspective:900px]">
			<div
				onTransitionEnd={() => {
					flippedIds.add(cardId);
					setRevealed(true);
				}}
				className={cn(
					"relative aspect-[5/7] transition-transform duration-700 [transform-style:preserve-3d] [transition-timing-function:cubic-bezier(0.34,1.56,0.64,1)]",
					flipped && "[transform:rotateY(180deg)]",
				)}
			>
				<img
					src={CARD_BACK_SRC}
					alt=""
					aria-hidden
					className="absolute inset-0 size-full rounded-lg object-cover [backface-visibility:hidden]"
				/>
				<img
					src={imageUrl}
					alt={name}
					className="absolute inset-0 size-full rounded-lg object-cover [backface-visibility:hidden] [transform:rotateY(180deg)]"
				/>
			</div>
		</div>
	);
}
