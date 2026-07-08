import type React from "react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useUiPrefs } from "../../store/ui-prefs";
import "./holo-card.css";
import "./rarity-styles.css";
import { cdnImage } from "./cdn-image";
import { cdnSetId } from "./foil-assets";
import {
	holoPresentation,
	VINTAGE_FRAME_SERIES,
	variantsToHolo,
} from "./holo-style";
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

/**
 * Badge for the fallback image's language. The fallback is always a region BASE
 * print (Western → English, Asian → Japanese), so read the base from the fallback
 * url: a TCGdex url carries "/{lang}/", a pokemontcg.io (or other) url is English.
 * Truthful across regions — a JP card whose Korean scan 404s shows "JA", not "EN".
 */
const FALLBACK_BADGE: Record<string, { code: string; name: string }> = {
	en: { code: "EN", name: "English" },
	ja: { code: "JA", name: "Japanese" },
};
function fallbackBadge(fallbackUrl: string | undefined): {
	code: string;
	name: string;
} {
	const lang = fallbackUrl?.match(/assets\.tcgdex\.net\/([a-z-]+)\//)?.[1];
	return (lang && FALLBACK_BADGE[lang]) || FALLBACK_BADGE.en;
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
	/**
	 * Baked English LOW-res url, the grid counterpart to imageUrlFallback. When a
	 * localized image 404s in a grid, we fall back to this thumbnail rather than
	 * the hi-res imageUrlFallback — else the grid loads a full-res image per tile.
	 */
	imageUrlSmallFallback?: string;
	name: string;
	rarity?: string;
	// Drive holo style + per-card CDN foil/mask resolution (see useFoilAssets).
	subtypes?: string[];
	supertype?: string;
	/** Energy types — drive per-type glow/foil-brightness (simey type classes). */
	types?: string[];
	setId?: string;
	/** pokemontcg.io set.series — drives era-aware holo style (e.g. cosmos). */
	series?: string;
	/** TCGplayer price-variant keys — distinguishes holo vs non-holo printings. */
	variants?: string[];
	cardNumber?: string;
	owned?: boolean;
	tilt?: boolean;
	/**
	 * Render this card's REVERSE HOLO printing — foil on the body, plain art
	 * window (simey CardProxy `isReverse`). Callers decide from printing data:
	 * a vault stack's recorded printing, or the card page's printing toggle.
	 */
	reverse?: boolean;
	/** Debug: hold the foil statically lit (no hover needed). Dev tooling only. */
	forceFoil?: boolean;

	onClick?: (e: React.MouseEvent | React.KeyboardEvent) => void;
	/** Fired on hover/focus — used to warm the card-detail fetch + focus image. */
	onPrefetch?: () => void;
	/** Legacy top-right hover slot (retained for grids not yet on the mini-nav). */
	hoverOverlay?: React.ReactNode;
	/**
	 * Unified glass mini-nav bar (owned / expand / binder), rendered centered in
	 * the card's lower third. Fades/scales in on hover, always shown on touch.
	 * The consistent interaction surface replacing the old top-right pill.
	 */
	miniNav?: React.ReactNode;
	size?: "grid" | "focus";

	className?: string;
	style?: React.CSSProperties;
}

export function HoloCard({
	imageUrl,
	imageUrlSmall,
	imageUrlFallback,
	imageUrlSmallFallback,
	name,
	rarity,
	subtypes,
	supertype,
	types,
	setId,
	series,
	variants,
	cardNumber,
	owned = false,
	tilt = false,
	reverse = false,
	forceFoil = false,
	onClick,
	onPrefetch,
	hoverOverlay,
	miniNav,
	size = "grid",
	className,
	style,
}: HoloCardProps) {
	// The pointer-tracking tilt + foil is gated behind the user's cardMotion pref
	// (S3: a per-field primitive selector in the component that consumes it).
	// prefers-reduced-motion further force-disables it inside the hook.
	const cardMotion = useUiPrefs((s) => s.cardMotion);
	const { ref } = useHoloEffect(forceFoil, cardMotion);
	useTiltEffect({ ref, enabled: tilt });
	const holo = holoPresentation({
		rarity,
		series,
		setId,
		cardNumber,
		subtypes,
		supertype,
		holo: variantsToHolo(variants),
		reverse,
	});
	// Real per-card CDN foil + mask (modern sets); 404 → procedural fallback.
	// Keyed on the EFFECTIVE rarity so the foil URL always agrees with the CSS
	// recipe — raw strings vary by data source (corpus ptcg.io vs live TCGdex,
	// promos whose raw rarity is "None") but the canonical one is stable.
	const foil = useFoilAssets(
		setId,
		cardNumber,
		holo.effectiveRarity ?? undefined,
		subtypes,
	);

	// Mirror simey/pokemon-cards-css: rarity-styles.css keys 1:1 off the same
	// data attributes their CSS uses — data-rarity (the *effective* simey
	// rarity from holoPresentation, not the raw corpus string), data-subtypes,
	// data-supertype, data-set/data-number (per-card promo recipes) and
	// data-trainer-gallery. All lowercased to match the selector values.
	const dataAttrs: Record<string, string> = {};
	if (holo.effectiveRarity) dataAttrs["data-rarity"] = holo.effectiveRarity;
	if (supertype) dataAttrs["data-supertype"] = supertype.toLowerCase();
	if (subtypes?.length)
		dataAttrs["data-subtypes"] = subtypes.join(" ").toLowerCase();
	// Normalized to the simey/ptcg.io vocabulary — the per-card promo CSS
	// (swsh-pikachu.css) keys on data-set="swsh12pt5" etc.
	if (setId) dataAttrs["data-set"] = cdnSetId(setId);
	if (cardNumber) dataAttrs["data-number"] = cardNumber.toLowerCase();
	if (holo.trainerGallery) dataAttrs["data-trainer-gallery"] = "true";
	// WotC-era frames have a different art window; the vintage clip variables
	// in rarity-styles.css key on this (procedural path only — masked cards'
	// real CDN masks always win).
	if (series && VINTAGE_FRAME_SERIES.has(series.toLowerCase()))
		dataAttrs["data-frame"] = "vintage";

	const classes = [
		"holo-card",
		`size-${size}`,
		holo.className,
		// Energy-type classes (water/fire/…) — simey keys --card-glow and the
		// reverse-holo --foil-brightness table on these.
		...(types ?? []).map((t) => t.toLowerCase()),
		foil.masked ? "masked" : null,
		owned ? "holo-card--owned" : null,
		// Motion off → CSS drops the tilt/foil transitions and swaps in a plain
		// hover lift (the effect hook is already inert; this styles the fallback).
		cardMotion ? null : "holo-card--static",
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
	// The grid keeps a thumbnail on fallback (imageUrlSmallFallback = EN low.webp);
	// only when that is absent does it drop to the hi-res imageUrlFallback.
	const resolvedLarge = usingFallback ? imageUrlFallback : imageUrl;
	const resolvedSmall = usingFallback
		? (imageUrlSmallFallback ?? imageUrlFallback)
		: imageUrlSmall;
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
			tabIndex={onClick || hoverOverlay || miniNav ? 0 : -1}
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
						// CORS mode so the SW browse-cache stores a non-opaque response
						// (the wsrv.nl CDN sends access-control-allow-origin: *). Without
						// it the request is no-cors, the cache put is skipped, and the
						// image-cache counts stay at zero.
						crossOrigin="anonymous"
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
							crossOrigin="anonymous"
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
						// CORS mode so the SW browse-cache can store a non-opaque
						// response (see the focus branch above for the full rationale).
						crossOrigin="anonymous"
						alt=""
						loading="lazy"
						decoding="async"
						fetchPriority="auto"
						onError={handleImgError}
					/>
				</picture>
			)}
			{/* Image is the region BASE print because TCGdex lacks a localized scan
			    for the active language (usingFallback) — English for the Western
			    catalog, Japanese for the Asian one (read from the fallback url).
			    Purely image-driven — independent of whether the NAME is localized (a
			    card can have a localized name but no localized image), so it stays
			    truthful in both grid and focus. */}
			{usingFallback &&
				hasImage &&
				(() => {
					const badge = fallbackBadge(imageUrlFallback);
					return (
						<span
							className="holo-card-lang-badge"
							role="img"
							aria-label={`Shown in ${badge.name}`}
						>
							{badge.code}
						</span>
					);
				})()}
			{/* Foil layer stack, 1:1 with simey's DOM: .card__shine → shine div
			    (+ ::before/::after sub-layers), .card__glare → glare div
			    (+ ::after). Real elements — CSS can't chain pseudo-elements, and
			    the recipes need all five compositing layers. Gated on hasImage so
			    the foil never renders over the missing-image identity placeholder. */}
			{hasImage && (
				<>
					<div className="holo-card-shine" aria-hidden="true" />
					<div className="holo-card-glare" aria-hidden="true" />
				</>
			)}
			<div className="holo-card-overlay">{hoverOverlay}</div>
			{miniNav && <div className="holo-card-mininav">{miniNav}</div>}
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
