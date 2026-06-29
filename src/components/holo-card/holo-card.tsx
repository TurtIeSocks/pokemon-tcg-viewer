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

export interface HoloCardProps {
	imageUrl: string;
	/** Smaller image used for grid display; falls back to imageUrl. */
	imageUrlSmall?: string;
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
	useEffect(() => {
		setHdLoaded(false);
		const img = fullRef.current;
		if (img?.complete && img.naturalWidth > 0) setHdLoaded(true);
	}, [imageUrl]);

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
			{size === "focus" ? (
				<>
					{/* Thumbnail placeholder: same URL the grid used, so it is a cache
					    hit and paints instantly. Blurred until the full-res lands. */}
					<img
						className={cn(
							"holo-card-image holo-card-image--placeholder",
							hdLoaded && "is-loaded",
						)}
						src={cdnImage(imageUrl, { w: 300 })}
						alt=""
						aria-hidden="true"
					/>
					{/* Full-res, fetched only on open (never on hover). Fades in on load. */}
					<picture>
						<source
							type="image/webp"
							srcSet={`${cdnImage(imageUrl, { w: 734 })} 1x, ${cdnImage(imageUrl, { w: 734, dpr: 2 })} 2x`}
						/>
						<img
							ref={fullRef}
							className={cn(
								"holo-card-image holo-card-image--full",
								hdLoaded && "is-loaded",
							)}
							src={imageUrl}
							alt=""
							loading="eager"
							decoding="async"
							fetchPriority="high"
							onLoad={() => setHdLoaded(true)}
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
						srcSet={`${cdnImage(imageUrl, { w: 300 })} 1x, ${cdnImage(imageUrl, { w: 300, dpr: 2 })} 2x`}
					/>
					<img
						className="holo-card-image"
						src={imageUrlSmall ?? imageUrl}
						alt=""
						loading="lazy"
						decoding="async"
						fetchPriority="auto"
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
