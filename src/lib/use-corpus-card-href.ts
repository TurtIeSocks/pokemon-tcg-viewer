import type { LinkProps } from "@tanstack/react-router";
import { useCallback, useRef } from "react";
import type { HoloCardData } from "../components/holo-card";
import { useSlugIndex } from "../store/corpus/corpus-runtime";
import { cardModalLinkProps } from "./card-route";

/**
 * Resolve each card's canonical `/$series/$set/$card` modal link from the client
 * slug index. Cards on a cross-set list (one species, one named Trainer, a whole
 * supertype) span many sets, so the link can't be derived from route params —
 * it's looked up per card. Falls back to `fallback` until the corpus + slug index
 * load (or when a card isn't in the index yet). Shared by every cross-set list
 * page (pokemon / trainer / energy / trainers / energies).
 */
export function useCorpusCardHref(
	fallback: LinkProps,
): (card: HoloCardData) => LinkProps {
	const slugIndex = useSlugIndex();
	// Callers pass a fresh `fallback` object literal each render, so keep it in a
	// ref and depend only on slugIndex — the resolver stays referentially stable
	// (it changes once, when the corpus loads) while still reading the latest
	// fallback. Depending on `fallback` directly would defeat the memo.
	const fallbackRef = useRef(fallback);
	fallbackRef.current = fallback;
	return useCallback(
		(card: HoloCardData): LinkProps =>
			(slugIndex ? cardModalLinkProps(slugIndex, card) : null) ??
			fallbackRef.current,
		[slugIndex],
	);
}
