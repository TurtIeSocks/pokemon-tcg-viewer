interface SeriesTabsProps {
	series: string[];
	selected: string | null;
	onSelect: (series: string) => void;
}

export function SeriesTabs({ series, selected, onSelect }: SeriesTabsProps) {
	return (
		<nav className="series-tabs" aria-label="Pokémon TCG series">
			{series.map((s) => (
				<button
					key={s}
					type="button"
					className={s === selected ? "series-tab active" : "series-tab"}
					onClick={() => onSelect(s)}
				>
					{s}
				</button>
			))}
		</nav>
	);
}
