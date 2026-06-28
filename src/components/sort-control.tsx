import { ArrowDown, ArrowUp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { SortControlProps } from "@/lib/sort";

const TRIGGER_CLASS =
	"border-[var(--border)] bg-[var(--glass)] text-[var(--ink-muted)] hover:bg-white/[0.07] hover:text-[var(--ink)]";

/**
 * Two fused segments -- a sort-mode dropdown and an ASC/DESC toggle -- in the
 * ButtonGroup style of the ResultsBar actions. Presentational: the consumer
 * owns state and decides any direction reset on mode change.
 */
export function SortControl<T extends string>({
	mode,
	dir,
	options,
	onModeChange,
	onDirChange,
	dirDisabled = false,
}: SortControlProps<T>) {
	const active = options.find((o) => o.value === mode) ?? options[0];
	const asc = dir === "asc";
	return (
		<ButtonGroup>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						type="button"
						variant="outline"
						size="sm"
						aria-label="Sort by"
						title={`Sort by ${active?.label ?? ""}`}
						className={TRIGGER_CLASS}
					>
						<span>{active?.label}</span>
						<ChevronDown className="size-4 opacity-70" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuRadioGroup
						value={mode}
						onValueChange={(v) => onModeChange(v as T)}
					>
						{options.map((o) => (
							<DropdownMenuRadioItem key={o.value} value={o.value}>
								{o.label}
							</DropdownMenuRadioItem>
						))}
					</DropdownMenuRadioGroup>
				</DropdownMenuContent>
			</DropdownMenu>
			<Button
				type="button"
				variant="outline"
				size="sm"
				disabled={dirDisabled}
				aria-label={asc ? "Sort ascending" : "Sort descending"}
				title={
					asc
						? "Ascending (click for descending)"
						: "Descending (click for ascending)"
				}
				onClick={() => onDirChange(asc ? "desc" : "asc")}
				className={TRIGGER_CLASS}
			>
				{asc ? (
					<ArrowUp className="size-4" />
				) : (
					<ArrowDown className="size-4" />
				)}
			</Button>
		</ButtonGroup>
	);
}
