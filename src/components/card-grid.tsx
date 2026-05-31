import React from "react";
import { useNavigate } from "react-router";
import { type GridComponents, VirtuosoGrid } from "react-virtuoso";
import { warmCard } from "../pages/card-prefetch";
import { useStore } from "../store";
import { HoloCard, type HoloCardData } from "./holo-card";
import "./card-grid.css";

const GridList: NonNullable<GridComponents["List"]> = React.forwardRef(
	({ children, className, style }, ref) => (
		<div
			ref={ref}
			style={style}
			className={["grid-list", className].filter(Boolean).join(" ")}
		>
			{children}
		</div>
	),
);

const GridItem: NonNullable<GridComponents["Item"]> = ({
	children,
	className,
	style,
	...rest
}) => (
	<div
		{...rest}
		style={style}
		className={["grid-item", className].filter(Boolean).join(" ")}
	>
		{children}
	</div>
);

const gridComponents: GridComponents = { List: GridList, Item: GridItem };

interface CardGridProps {
	setId: string | null;
	cards: HoloCardData[];
	onEndReached: (setId: string) => void;
	renderOverlay?: (card: HoloCardData) => React.ReactNode;
}

export function CardGrid({
	setId,
	cards,
	onEndReached,
	renderOverlay,
}: CardGridProps) {
	const navigate = useNavigate();
	const owned = useStore((s) => s.owned);
	return (
		<VirtuosoGrid
			key={setId ?? "empty"}
			className="virtuoso-grid"
			data={cards}
			endReached={() => {
				if (setId) onEndReached(setId);
			}}
			increaseViewportBy={400}
			components={gridComponents}
			itemContent={(_, card) => (
				<HoloCard
					imageUrl={card.imageUrl}
					imageUrlSmall={card.imageUrlSmall}
					name={card.name}
					rarity={card.rarity}
					subtypes={card.subtypes}
					supertype={card.supertype}
					setId={card.setId}
					series={card.setSeries}
					variants={card.variants}
					cardNumber={card.cardNumber}
					owned={!!owned[card.id]}
					hoverOverlay={renderOverlay?.(card)}
					onPrefetch={() => warmCard(card)}
					onClick={(e) => {
						if (e.defaultPrevented) return;
						navigate(`/card/${card.id}`);
					}}
					style={{ width: 300 }}
				/>
			)}
		/>
	);
}
