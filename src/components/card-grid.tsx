import { HoloCard, type HoloCardData } from "pokemon-holo-cards";
import React from "react";
import { type GridComponents, VirtuosoGrid } from "react-virtuoso";

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
}

export function CardGrid({ setId, cards, onEndReached }: CardGridProps) {
	return (
		<VirtuosoGrid
			key={setId ?? "empty"}
			className="grid"
			data={cards}
			endReached={() => {
				if (setId) onEndReached(setId);
			}}
			increaseViewportBy={400}
			components={gridComponents}
			itemContent={(_, card) => {
				// Strip `id` so HoloCard doesn't trigger its built-in per-card
				// auto-fetch — we already have full data from the bulk request.
				const { id: _id, ...rest } = card;
				return <HoloCard {...rest} style={{ width: 300 }} />;
			}}
		/>
	);
}
