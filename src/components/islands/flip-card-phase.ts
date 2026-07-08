/**
 * FlipCard state machine phases + the crossfade class helper.
 *
 * Extracted from flip-card.tsx so the transition logic is unit-testable and so
 * the component file exports only a component (no react-refresh churn).
 */
export type Phase = "loading" | "back" | "flipping" | "done";

/**
 * Class for the card-back overlay. The reveal is a CROSSFADE (opacity), not a
 * 3D rotateY flip: the back sits opaque over the front while the image loads,
 * then fades to transparent to reveal the front beneath it.
 */
export function backOverlayClass(phase: Phase): string {
	return phase === "flipping" ? "opacity-0" : "opacity-100";
}
