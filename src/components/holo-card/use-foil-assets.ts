import { useEffect, useMemo, useState } from "react";
import { buildFoilUrls, getCssRarity } from "./foil-assets";

export interface FoilAssets {
	/** Append `masked` to the card className once the per-card mask has loaded. */
	masked: boolean;
	/**
	 * True while a per-card mask EXISTS (masked set) but is still downloading —
	 * i.e. neither loaded nor 404'd yet. The card should paint NO foil during
	 * this window: without the mask, the `:not(.masked)` procedural recipe would
	 * flash a full-rectangle foil for a beat before the real masked foil lands.
	 * Cleared once the mask resolves (loaded → masked; error → procedural).
	 */
	maskPending: boolean;
	/** Inline CSS custom properties (--mask / --foil) to spread on the card. */
	vars: React.CSSProperties;
}

/** Per-card mask lifecycle. `idle` = no CDN asset for this set (procedural). */
type MaskStatus = "idle" | "loading" | "loaded" | "error";

/**
 * Resolve a card's real CDN foil + mask (modern sets only) and preload the mask
 * image. Returns `masked: true` and the inline `--mask`/`--foil` vars only after
 * the mask actually loads — so a 404 (set/card with no CDN asset) silently falls
 * back to the procedural era styles + clip-path windows in rarity-styles.css.
 * While the mask is still downloading, `maskPending` is true so the caller can
 * withhold the foil layers (else the procedural rectangle flashes through).
 *
 * Mirrors pokemon-holo-cards' load-gated masking: never shows a broken effect.
 */
export function useFoilAssets(
	setId?: string,
	cardNumber?: string,
	rarity?: string,
	subtypes?: string[],
): FoilAssets {
	const cssRarity = useMemo(() => getCssRarity(rarity), [rarity]);
	const foilUrls = useMemo(
		() =>
			cssRarity && setId && cardNumber
				? buildFoilUrls(setId, cardNumber, cssRarity, subtypes)
				: null,
		[cssRarity, setId, cardNumber, subtypes],
	);
	const maskUrl = foilUrls?.maskUrl ?? null;
	// Initial state matches on server and first client render (maskUrl is
	// deterministic), so hydration agrees; the effect then resolves it. A masked
	// card starts "loading" → no foil, not the un-masked rectangle.
	const [status, setStatus] = useState<MaskStatus>(
		maskUrl ? "loading" : "idle",
	);

	useEffect(() => {
		if (!maskUrl || typeof window === "undefined") {
			setStatus("idle");
			return;
		}
		setStatus("loading");
		let cancelled = false;
		const img = new window.Image();
		img.onload = () => {
			if (!cancelled) setStatus("loaded");
		};
		img.onerror = () => {
			if (!cancelled) setStatus("error");
		};
		img.src = maskUrl;
		return () => {
			cancelled = true;
		};
	}, [maskUrl]);

	const maskLoaded = status === "loaded";

	const vars = useMemo<React.CSSProperties>(() => {
		if (!maskLoaded || !maskUrl) return {};
		const v: Record<string, string> = { "--mask": `url('${maskUrl}')` };
		// --foil rides along whenever the mask loads — simey's Card.svelte sets
		// both unconditionally. Reverse holo NEEDS it: the CDN reverse foil scan
		// carries the energy-symbol etch pattern the masked reverse recipe paints
		// (reverse-holo.css nulls --foil itself on the :not(.masked) path).
		if (foilUrls?.foilUrl) {
			v["--foil"] = `url('${foilUrls.foilUrl}')`;
		}
		return v as React.CSSProperties;
	}, [maskLoaded, maskUrl, foilUrls]);

	return {
		masked: maskLoaded && !!maskUrl,
		maskPending: status === "loading" && !!maskUrl,
		vars,
	};
}
