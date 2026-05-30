import type React from "react";
import "./holo-card.css";
import "./rarity-styles.css";
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
			<img
				className="holo-card-image"
				src={size === "focus" ? imageUrl : (imageUrlSmall ?? imageUrl)}
				alt=""
				loading={size === "focus" ? "eager" : "lazy"}
				decoding={size === "focus" ? "auto" : "async"}
				fetchPriority={size === "focus" ? "high" : "auto"}
			/>
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
