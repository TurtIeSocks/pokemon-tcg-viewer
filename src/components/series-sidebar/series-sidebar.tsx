import { Home as HomeIcon, Layers } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useSets } from "../../hooks/use-sets";
import {
	useNameQueryParam,
	useSetIdParam,
} from "../../hooks/use-url-selection";
import { groupSetsBySeries } from "../../utils/group-sets-by-series";
import { SeriesSidebarItem } from "./series-sidebar-item";

interface SeriesSidebarProps {
	/** Called after a set is chosen (e.g. to close the mobile sheet). */
	onAfterSelect?: () => void;
}

export function SeriesSidebar({ onAfterSelect }: SeriesSidebarProps) {
	const sets = useSets();
	const [selectedSetId, setSelectedSetId] = useSetIdParam();
	const [query] = useNameQueryParam();
	const isHome = !selectedSetId && query === "";
	const groups = useMemo(() => groupSetsBySeries(sets), [sets]);

	const selectedSeries = useMemo(
		() => sets.find((s) => s.id === selectedSetId)?.series ?? null,
		[sets, selectedSetId],
	);
	const [openSeries, setOpenSeries] = useState<string | null>(null);

	// Auto-expand the series containing the selected set as it resolves.
	useEffect(() => {
		if (selectedSeries) setOpenSeries(selectedSeries);
	}, [selectedSeries]);

	return (
		<ScrollArea className="h-full">
			<div className="flex flex-col gap-0.5 p-3">
				<Link
					to="/"
					onClick={() => onAfterSelect?.()}
					className={cn(
						"flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
						isHome
							? "bg-primary text-primary-foreground"
							: "text-foreground hover:bg-secondary",
					)}
				>
					<HomeIcon className="size-4 shrink-0" />
					Home
				</Link>
				<div className="mt-2 flex items-center gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
					<Layers className="size-4" />
					Series & Sets
				</div>
				{groups.map(({ series, sets: seriesSets, year }) => (
					<SeriesSidebarItem
						key={series}
						series={series}
						year={year}
						sets={seriesSets}
						open={openSeries === series}
						onOpenChange={(open) => setOpenSeries(open ? series : null)}
						selectedSetId={selectedSetId}
						onSelect={(id) => {
							setSelectedSetId(id);
							onAfterSelect?.();
						}}
					/>
				))}
			</div>
		</ScrollArea>
	);
}
