import type { HoloCardData } from "./types";

/**
 * Small-thumbnail src with fallback to the full image. Matches the
 * `nonEmptyUrl` semantics used by HoloCard/set-tile: an empty string counts
 * as absent (older data carries `""`). Returns `undefined` when both are
 * absent, so React omits the `src` attribute entirely — never emit `src=""`,
 * which the HTML spec treats as a self-reference. Every card-thumbnail
 * surface must use this helper — a bare `imageUrlSmall` renders a broken
 * image for cards without a small image.
 */
export function cardThumbSrc(
	card: Pick<HoloCardData, "imageUrl" | "imageUrlSmall">,
): string | undefined {
	return card.imageUrlSmall || card.imageUrl || undefined;
}
