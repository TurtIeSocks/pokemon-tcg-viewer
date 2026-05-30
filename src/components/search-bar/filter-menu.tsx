import { Check, ListFilter } from "lucide-react";
import { useSearchParams } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useFilterValues } from "../../hooks/use-filter-values";
import { useFilterParam } from "../../hooks/use-url-selection";

function FilterGroup({
	label,
	paramName,
	options,
}: {
	label: string;
	paramName: string;
	options: string[];
}) {
	const [active, setActive] = useFilterParam(paramName);
	if (options.length === 0) return null;
	const toggle = (v: string) =>
		setActive(
			active.includes(v) ? active.filter((x) => x !== v) : [...active, v],
		);
	return (
		<div className="space-y-1">
			<div className="px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
				{label}
			</div>
			<div className="flex flex-wrap gap-1">
				{options.map((opt) => (
					<button
						key={opt}
						type="button"
						onClick={() => toggle(opt)}
						className={cn(
							"flex items-center gap-1 rounded-full px-2.5 py-1 text-sm transition-colors",
							active.includes(opt)
								? "bg-primary text-primary-foreground"
								: "bg-secondary text-muted-foreground hover:text-foreground",
						)}
					>
						{active.includes(opt) && <Check className="size-3" />}
						{opt}
					</button>
				))}
			</div>
		</div>
	);
}

export function FilterMenu() {
	const [params, setParams] = useSearchParams();
	const values = useFilterValues();
	const [types] = useFilterParam("types");
	const [rarity] = useFilterParam("rarity");
	const [supertype] = useFilterParam("supertype");
	const [subtypes] = useFilterParam("subtypes");
	const activeCount =
		types.length + rarity.length + supertype.length + subtypes.length;

	const clearAll = () => {
		const next = new URLSearchParams(params);
		for (const key of ["types", "rarity", "supertype", "subtypes"]) {
			next.delete(key);
		}
		setParams(next);
	};

	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button
					variant={activeCount ? "default" : "outline"}
					className="shrink-0"
				>
					<ListFilter className="size-4 sm:mr-2" />
					<span className="hidden sm:inline">Filter</span>
					{activeCount > 0 && (
						<Badge variant="secondary" className="ml-2">
							{activeCount}
						</Badge>
					)}
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-80 p-3">
				<ScrollArea className="max-h-[60vh]">
					<div className="space-y-3 pr-2">
						<FilterGroup
							label="Type"
							paramName="types"
							options={values.types}
						/>
						<FilterGroup
							label="Rarity"
							paramName="rarity"
							options={values.rarities}
						/>
						<FilterGroup
							label="Supertype"
							paramName="supertype"
							options={values.supertypes}
						/>
						<FilterGroup
							label="Subtype"
							paramName="subtypes"
							options={values.subtypes}
						/>
						{activeCount > 0 && (
							<Button
								variant="ghost"
								size="sm"
								onClick={clearAll}
								className="w-full"
							>
								Clear all filters
							</Button>
						)}
					</div>
				</ScrollArea>
			</PopoverContent>
		</Popover>
	);
}
