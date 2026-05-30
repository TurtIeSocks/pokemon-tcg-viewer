import { Check, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useFilterParam } from "../../hooks/use-url-selection";

interface FilterPopoverProps {
	label: string;
	paramName: string;
	options: string[];
}

export function FilterPopover({
	label,
	paramName,
	options,
}: FilterPopoverProps) {
	const [active, setActive] = useFilterParam(paramName);

	const toggle = (value: string) => {
		setActive(
			active.includes(value)
				? active.filter((v) => v !== value)
				: [...active, value],
		);
	};

	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button
					variant={active.length ? "default" : "outline"}
					size="sm"
					disabled={!options.length}
				>
					{label}
					{active.length > 0 && (
						<Badge variant="secondary" className="ml-2">
							{active.length}
						</Badge>
					)}
					<ChevronDown className="ml-1 size-4" />
				</Button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-56 p-1">
				<ScrollArea className="max-h-72">
					{options.map((opt) => (
						<button
							key={opt}
							type="button"
							onClick={() => toggle(opt)}
							className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-secondary"
						>
							<Check
								className={cn(
									"size-4",
									active.includes(opt) ? "opacity-100" : "opacity-0",
								)}
							/>
							<span className="flex-1 truncate">{opt}</span>
						</button>
					))}
				</ScrollArea>
			</PopoverContent>
		</Popover>
	);
}
