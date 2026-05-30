import { ChevronRight } from "lucide-react";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { PokemonSet } from "../../api";

interface SeriesSidebarItemProps {
	series: string;
	year: number;
	sets: PokemonSet[];
	open: boolean;
	onOpenChange: (open: boolean) => void;
	selectedSetId: string | null;
	onSelect: (setId: string) => void;
}

export function SeriesSidebarItem({
	series,
	year,
	sets,
	open,
	onOpenChange,
	selectedSetId,
	onSelect,
}: SeriesSidebarItemProps) {
	const hasSelected = sets.some((s) => s.id === selectedSetId);
	return (
		<Collapsible open={open} onOpenChange={onOpenChange}>
			<CollapsibleTrigger
				className={cn(
					"flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors",
					hasSelected ? "text-primary" : "text-foreground hover:bg-secondary",
				)}
			>
				<ChevronRight
					className={cn(
						"size-4 shrink-0 transition-transform",
						open && "rotate-90",
					)}
				/>
				<span className="flex-1 truncate">{series}</span>
				<span className="text-xs tabular-nums text-muted-foreground">
					{year}
				</span>
				<span className="text-xs text-muted-foreground">{sets.length}</span>
			</CollapsibleTrigger>
			<CollapsibleContent className="ml-4 border-l border-border pl-3">
				{sets.map((set) => (
					<button
						key={set.id}
						type="button"
						onClick={() => onSelect(set.id)}
						aria-current={set.id === selectedSetId ? "true" : undefined}
						className={cn(
							"flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
							set.id === selectedSetId
								? "bg-primary text-primary-foreground"
								: "text-muted-foreground hover:bg-secondary hover:text-foreground",
						)}
					>
						<span className="flex size-5 shrink-0 items-center justify-center">
							<img
								src={set.images.symbol}
								alt=""
								className="max-h-5 max-w-5 object-contain"
							/>
						</span>
						<span className="flex-1 truncate">{set.name}</span>
						<span className="text-xs opacity-70">{set.total}</span>
					</button>
				))}
			</CollapsibleContent>
		</Collapsible>
	);
}
