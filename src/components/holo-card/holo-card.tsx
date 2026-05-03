import type React from "react";
import "./holo-card.css";
import "./rarity-styles.css";
import { getRarityClass } from "./rarity";
import { useHoloEffect } from "./use-holo-effect";

export interface HoloCardProps {
	imageUrl: string;
	name: string;
	rarity?: string;
	// Forwarded from API but not yet consumed; reserved for Task 7+ rarity heuristics.
	subtypes?: string[];
	supertype?: string;
	setId?: string;
	cardNumber?: string;

	onClick?: (e: React.MouseEvent | React.KeyboardEvent) => void;
	hoverOverlay?: React.ReactNode;
	size?: "grid" | "focus";

	className?: string;
	style?: React.CSSProperties;
}

export function HoloCard({
	imageUrl,
	name,
	rarity,
	onClick,
	hoverOverlay,
	size = "grid",
	className,
	style,
}: HoloCardProps) {
	const { ref } = useHoloEffect();
	const rarityClass = getRarityClass(rarity);

	const classes = ["holo-card", `size-${size}`, rarityClass, className]
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
			style={style}
			role="button"
			tabIndex={onClick || hoverOverlay ? 0 : -1}
			onClick={onClick}
			onKeyDown={handleKeyDown}
			aria-label={name}
		>
			<img className="holo-card-image" src={imageUrl} alt="" />
			<div className="holo-card-overlay">{hoverOverlay}</div>
		</div>
	);
}
