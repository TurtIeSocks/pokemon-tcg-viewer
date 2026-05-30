import type { SeriesGroup } from "../../utils/group-sets-by-series";
import { SeriesMenuItem } from "./series-menu-item";
import "./series-menu.css";
import { useSeriesMenu } from "./use-series-menu";

interface SeriesMenuProps {
	/** Sets grouped by series, in display order. */
	groups: SeriesGroup[];
	/** Series containing the selected set — highlighted in the row. */
	selectedSeries: string | null;
	/** Currently selected set — highlighted inside its popover. */
	selectedSetId: string | null;
	/** Fired when a set is chosen from a popover. */
	onSelect: (setId: string) => void;
	/** Hover-intent open delay (ms). Exposed for tests. */
	openDelay?: number;
	/** Hover-intent close grace (ms). Exposed for tests. */
	closeDelay?: number;
}

/**
 * Series filter row. Each series is a trigger that reveals its sets in a hover
 * (or click / keyboard) popover, replacing the old always-expanded set row.
 */
export function SeriesMenu({
	groups,
	selectedSeries,
	selectedSetId,
	onSelect,
	openDelay,
	closeDelay,
}: SeriesMenuProps) {
	const menu = useSeriesMenu({ openDelay, closeDelay });

	return (
		<nav
			className="series-menu"
			aria-label="Pokémon TCG series"
			ref={menu.rootRef}
		>
			{groups.map(({ series, sets }) => (
				<SeriesMenuItem
					key={series}
					series={series}
					sets={sets}
					isOpen={menu.openSeries === series}
					isActive={series === selectedSeries}
					selectedSetId={selectedSetId}
					onEnter={menu.handleEnter}
					onLeave={menu.handleLeave}
					onToggle={menu.toggle}
					onOpen={menu.openNow}
					onClose={menu.closeNow}
					onSelect={onSelect}
				/>
			))}
		</nav>
	);
}
