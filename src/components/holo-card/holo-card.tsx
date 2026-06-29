import type React from "react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import "./holo-card.css";
import "./rarity-styles.css";
import { cdnImage } from "./cdn-image";
import { getHoloClass, variantsToHolo } from "./holo-style";
import { useFoilAssets } from "./use-foil-assets";
import { useHoloEffect } from "./use-holo-effect";
import { useTiltEffect } from "./use-tilt-effect";

/**
 * Coerce a blank-or-nullish image url to `undefined`. ~803 cards have no image
 * in any source; older data also carries `""`. Returning `undefined` lets the
 * caller omit the element entirely — never emit `src=""` / `srcSet=""`, which
 * (per the HTML spec) re-fetches the whole page and causes a visible flash.
 */
function nonEmptyUrl(url: string | null | undefined): string | undefined {
	return url ? url : undefined;
}

export interface HoloCardProps {
	imageUrl: string;
	/** Smaller image used for grid display; falls back to imageUrl. */
	imageUrlSmall?: string;
	/**
	 * Baked English image url to retry once when the (localized) imageUrl 404s.
	 * Set only when rendering a non-English language whose derived image differs;
	 * undefined for English. See the onError reconciliation below.
	 */
	imageUrlFallback?: string;
	name: string;
	rarity?: string;
	// Drive holo style + per-card CDN foil/mask resolution (see useFoilAssets).
	subtypes?: string[];
	supertype?: string;
	setId?: string;
	/** pokemontcg.io set.series — drives era-aware holo style (e.g. cosmos). */
	series?: string;
	/** TCGplayer price-variant keys — distinguishes holo vs non-holo printings. */
	variants?: string[];
	cardNumber?: string;
	owned?: boolean;
	tilt?: boolean;
	/** Debug: hold the foil statically lit (no hover needed). Dev tooling only. */
	forceFoil?: boolean;

	onClick?: (e: React.MouseEvent | React.KeyboardEvent) => void;
	/** Fired on hover/focus — used to warm the card-detail fetch + focus image. */
	onPrefetch?: () => void;
	hoverOverlay?: React.ReactNode;
	size?: "grid" | "focus";

	className?: string;
	style?: React.CSSProperties;
}

export function HoloCard({
	imageUrl,
	imageUrlSmall,
	imageUrlFallback,
	name,
	rarity,
	subtypes,
	supertype,
	setId,
	series,
	variants,
	cardNumber,
	owned = false,
	tilt = false,
	forceFoil = false,
	onClick,
	onPrefetch,
	hoverOverlay,
	size = "grid",
	className,
	style,
}: HoloCardProps) {
	const { ref } = useHoloEffect(forceFoil);
	useTiltEffect({ ref, enabled: tilt });
	const rarityClass = getHoloClass(
		rarity,
		series,
		variantsToHolo(variants),
		setId,
	);
	// Real per-card CDN foil + mask (modern sets); 404 → procedural fallback.
	const foil = useFoilAssets(setId, cardNumber, rarity, subtypes);

	// Mirror simey/pokemon-cards-css: the foil-confinement clip-paths in
	// rarity-styles.css key off data-rarity + data-subtypes + data-supertype
	// (e.g. [data-rarity="rare holo"][data-subtypes^="stage"]). Lowercased to
	// match the attribute-selector values 1:1.
	const dataAttrs: Record<string, string> = {};
	if (rarity) dataAttrs["data-rarity"] = rarity.toLowerCase();
	if (supertype) dataAttrs["data-supertype"] = supertype.toLowerCase();
	if (subtypes?.length)
		dataAttrs["data-subtypes"] = subtypes.join(" ").toLowerCase();

	const classes = [
		"holo-card",
		`size-${size}`,
		rarityClass,
		foil.masked ? "masked" : null,
		owned ? "holo-card--owned" : null,
		className,
	]
		.filter(Boolean)
		.join(" ");

	function handleKeyDown(e: React.KeyboardEvent) {
		if (!onClick) return;
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			onClick(e);
		}
	}

	// Focus only: paint the (cached) thumbnail immediately, then fade the full-res
	// image in once it loads. Reset on card change; a cached HD may already be
	// `complete` before onLoad can fire, so detect that too.
	const [hdLoaded, setHdLoaded] = useState(false);
	const fullRef = useRef<HTMLImageElement>(null);

	// If the image url 404s — true blanks point at a dead url that is the only
	// one we have — drop to the bare frame instead of a broken-image icon. The
	// flag makes onError fire once: once errored, the <img> is unmounted so it
	// can't loop.
	const [errored, setErrored] = useState(false);
	// Localized-image reconciliation: a non-English derived image may 404 where
	// English exists (imageUrlFallback). On the first error, retry the EN url
	// once by re-rendering both <source> and <img> at the fallback url; only if
	// EN also fails do we fall through to the empty state. Loop-safe: each url is
	// tried at most once (localized → EN → empty).
	const [usingFallback, setUsingFallback] = useState(false);
	// Reset load/error/fallback state when the displayed card changes. imageUrl is
	// the intended trigger even though the body only reads it via the ref's cached
	// image; biome flags it as "unnecessary" — keep it (a single-line ignore is
	// required because the directive must sit directly above the hook).
	// biome-ignore lint/correctness/useExhaustiveDependencies: imageUrl is the intended re-run trigger; see comment above.
	useEffect(() => {
		setHdLoaded(false);
		setErrored(false);
		setUsingFallback(false);
		const img = fullRef.current;
		if (img?.complete && img.naturalWidth > 0) setHdLoaded(true);
	}, [imageUrl]);

	// One shared error handler for every <img>. Retry the EN fallback once, then
	// give up to the empty state.
	function handleImgError() {
		if (!usingFallback && imageUrlFallback && imageUrlFallback !== imageUrl) {
			setUsingFallback(true);
			return;
		}
		setErrored(true);
	}

	// The url to actually render: the EN fallback once a localized image failed,
	// otherwise the (possibly localized) imageUrl/Small. `||` (not `??`) so an
	// empty-string imageUrlSmall falls through to imageUrl rather than src="".
	const resolvedLarge = usingFallback ? imageUrlFallback : imageUrl;
	const resolvedSmall = usingFallback ? imageUrlFallback : imageUrlSmall;
	const gridUrl = nonEmptyUrl(resolvedSmall || resolvedLarge);
	const focusUrl = nonEmptyUrl(resolvedLarge);
	const hasImage = !errored && (size === "focus" ? focusUrl : gridUrl);

	return (
		// biome-ignore lint/a11y/useSemanticElements: <div> is intentional — a <button> cannot contain block-level children like <img>+overlay
		<div
			ref={ref}
			className={classes}
			style={{ ...foil.vars, ...style }}
			role="button"
			tabIndex={onClick || hoverOverlay ? 0 : -1}
			onClick={onClick}
			onPointerEnter={onPrefetch}
			onFocus={onPrefetch}
			onKeyDown={handleKeyDown}
			aria-label={name}
			{...dataAttrs}
		>
			{/* When there is no usable image (blank in every source, or the baked
			    url 404'd), render the card's IDENTITY instead of a bare frame —
			    name + number + set so a collector can tell what it is without
			    clicking. STATIC: text only, no <img>/<source> (an empty/blank url
			    re-fetches the page → flash), no animation, no timer. */}
			{!hasImage ? (
				<div className="holo-card-empty">
					<span className="holo-card-empty-name">{name}</span>
					{(cardNumber || series) && (
						<span className="holo-card-empty-meta">
							{cardNumber && (
								<span className="holo-card-empty-number tabular-nums">
									#{cardNumber}
								</span>
							)}
							{cardNumber && series && <span aria-hidden="true"> · </span>}
							{series}
						</span>
					)}
					<span className="holo-card-empty-cue">no image</span>
				</div>
			) : size === "focus" ? (
				<>
					{/* Thumbnail placeholder: same URL the grid used, so it is a cache
					    hit and paints instantly. Blurred until the full-res lands. */}
					<img
						className={cn(
							"holo-card-image holo-card-image--placeholder",
							hdLoaded && "is-loaded",
						)}
						src={cdnImage(focusUrl as string, { w: 300 })}
						alt=""
						aria-hidden="true"
					/>
					{/* Full-res, fetched only on open (never on hover). Fades in on load. */}
					<picture>
						<source
							type="image/webp"
							srcSet={`${cdnImage(focusUrl as string, { w: 734 })} 1x, ${cdnImage(focusUrl as string, { w: 734, dpr: 2 })} 2x`}
						/>
						<img
							ref={fullRef}
							className={cn(
								"holo-card-image holo-card-image--full",
								hdLoaded && "is-loaded",
							)}
							src={focusUrl}
							alt=""
							loading="eager"
							decoding="async"
							fetchPriority="high"
							onLoad={() => setHdLoaded(true)}
							onError={handleImgError}
						/>
					</picture>
					{!hdLoaded && (
						<span className="holo-card-hd" aria-hidden="true">
							Loading full image
						</span>
					)}
				</>
			) : (
				<picture>
					<source
						type="image/webp"
						srcSet={`${cdnImage(gridUrl as string, { w: 300 })} 1x, ${cdnImage(gridUrl as string, { w: 300, dpr: 2 })} 2x`}
					/>
					<img
						className="holo-card-image"
						src={gridUrl}
						alt=""
						loading="lazy"
						decoding="async"
						fetchPriority="auto"
						onError={handleImgError}
					/>
				</picture>
			)}
			<div className="holo-card-overlay">{hoverOverlay}</div>
			{owned && (
				<span
					className="holo-card-owned-badge"
					role="img"
					aria-label="In your collection"
				>
					✓
				</span>
			)}
		</div>
	);
}
