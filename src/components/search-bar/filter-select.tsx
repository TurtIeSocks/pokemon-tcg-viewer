import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useFilterParam } from "../../hooks/use-url-selection";

interface FilterSelectProps {
	label: string;
	paramName: string;
	options: string[];
}

/**
 * One filter dimension as a multi-select dropdown styled like a <select>.
 * Full-width trigger (fills its grid cell); the popover holds a checkable
 * option list. Backed by the URL param via useFilterParam.
 */
export function FilterSelect({ label, paramName, options }: FilterSelectProps) {
	const [active, setActive] = useFilterParam(paramName);
	const toggle = (v: string) =>
		setActive(
			active.includes(v) ? active.filter((x) => x !== v) : [...active, v],
		);

	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button
					variant="outline"
					disabled={options.length === 0}
					className={cn(
						"w-full justify-between font-normal",
						active.length === 0 && "text-muted-foreground",
					)}
				>
					<span className="truncate">
						{label}
						{active.length > 0 ? ` (${active.length})` : ""}
					</span>
					<ChevronDown className="ml-2 size-4 shrink-0 opacity-50" />
				</Button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-56 p-1">
				<ScrollArea className="max-h-72">
					<div className="pr-1">
						{options.map((opt) => (
							<button
								key={opt}
								type="button"
								onClick={() => toggle(opt)}
								className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-secondary"
							>
								<Check
									className={cn(
										"size-4 shrink-0",
										active.includes(opt) ? "opacity-100" : "opacity-0",
									)}
								/>
								<span className="flex-1 truncate">{opt}</span>
							</button>
						))}
					</div>
				</ScrollArea>
				{active.length > 0 && (
					<button
						type="button"
						onClick={() => setActive([])}
						className="mt-1 w-full rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-secondary"
					>
						Clear {label}
					</button>
				)}
			</PopoverContent>
		</Popover>
	);
}
