import { useEffect, useMemo, useState } from "react";
import { buildFoilUrls, getCssRarity, isReverseRarity } from "./foil-assets";

export interface FoilAssets {
	/** Append `masked` to the card className once the per-card mask has loaded. */
	masked: boolean;
	/** Inline CSS custom properties (--mask / --foil) to spread on the card. */
	vars: React.CSSProperties;
}

/**
 * Resolve a card's real CDN foil + mask (modern sets only) and preload the mask
 * image. Returns `masked: true` and the inline `--mask`/`--foil` vars only after
 * the mask actually loads — so a 404 (set/card with no CDN asset) silently falls
 * back to the procedural era styles + clip-path windows in rarity-styles.css.
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
	const [maskLoaded, setMaskLoaded] = useState(false);

	useEffect(() => {
		if (!maskUrl || typeof window === "undefined") {
			setMaskLoaded(false);
			return;
		}
		let cancelled = false;
		const img = new window.Image();
		img.onload = () => {
			if (!cancelled) setMaskLoaded(true);
		};
		img.onerror = () => {
			if (!cancelled) setMaskLoaded(false);
		};
		img.src = maskUrl;
		return () => {
			cancelled = true;
		};
	}, [maskUrl]);

	const vars = useMemo<React.CSSProperties>(() => {
		if (!maskLoaded || !maskUrl) return {};
		const v: Record<string, string> = { "--mask": `url('${maskUrl}')` };
		// Reverse holo uses the mask only (no foil texture) — matches the reference.
		if (foilUrls?.foilUrl && !isReverseRarity(cssRarity)) {
			v["--foil"] = `url('${foilUrls.foilUrl}')`;
		}
		return v as React.CSSProperties;
	}, [maskLoaded, maskUrl, foilUrls, cssRarity]);

	return { masked: maskLoaded && !!maskUrl, vars };
}
