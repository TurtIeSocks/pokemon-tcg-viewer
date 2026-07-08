"use client";

import { ChevronDown, Equal, Sparkles, TextSearch } from "lucide-react";
import type { ComponentType } from "react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import type { SearchMode } from "@/store/corpus/fuzzy";

interface SearchModeMeta {
	mode: SearchMode;
	/** Thunk, not a plain string — see {@link NavDestination.label} in command-palette-data.ts. */
	label: () => string;
	description: () => string;
	icon: ComponentType<{ className?: string }>;
}

// Single source of truth for the three modes — drives both the trigger
// (active mode's icon/label) and the menu items. Order = menu order.
const SEARCH_MODES: readonly SearchModeMeta[] = [
	{
		mode: "exact",
		label: () => m.search_mode_exact_label(),
		description: () => m.search_mode_exact_description(),
		icon: Equal,
	},
	{
		mode: "contains",
		label: () => m.search_mode_contains_label(),
		description: () => m.search_mode_contains_description(),
		icon: TextSearch,
	},
	{
		mode: "fuzzy",
		label: () => m.search_mode_fuzzy_label(),
		description: () => m.search_mode_fuzzy_description(),
		icon: Sparkles,
	},
];

interface SearchModeMenuProps {
	value: SearchMode;
	onChange: (mode: SearchMode) => void;
	disabled?: boolean;
	/**
	 * Extra trigger classes. Overrides the default `rounded-none` (ButtonGroup
	 * fusion) so the picker can also stand alone — e.g. inside the collapsed
	 * filter body on mobile, where it renders rounded + full-width.
	 */
	className?: string;
}

/**
 * Three-mode search picker (Exact / Contains / Fuzzy) designed to compose
 * inside a `<ButtonGroup>` next to the search input. The trigger always shows
 * the active mode's icon + label so it reads clearly both fused in the bar and
 * standalone; `aria-label`/`title` carry the meaning for assistive tech.
 */
export function SearchModeMenu({
	value,
	onChange,
	disabled = false,
	className,
}: SearchModeMenuProps) {
	const active =
		SEARCH_MODES.find((mode) => mode.mode === value) ?? SEARCH_MODES[2];
	const ActiveIcon = active.icon;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					type="button"
					variant="outline"
					disabled={disabled}
					aria-label={m.search_mode_label()}
					title={m.search_mode_title({
						label: active.label(),
						description: active.description(),
					})}
					className={cn(
						"rounded-none border-(--border) bg-(--glass) text-(--ink-muted) hover:bg-white/[0.07] hover:text-(--ink)",
						className,
					)}
				>
					<ActiveIcon className="size-4" />
					<span>{active.label()}</span>
					<ChevronDown className="size-4 opacity-70" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				<DropdownMenuRadioGroup
					value={value}
					onValueChange={(next) => onChange(next as SearchMode)}
				>
					{SEARCH_MODES.map(({ mode, label, description, icon: Icon }) => (
						<DropdownMenuRadioItem key={mode} value={mode}>
							<Icon className="size-4" aria-hidden="true" />
							<span className="flex flex-col">
								<span className="text-(--ink)">{label()}</span>
								<span className="text-xs text-(--ink-muted)">
									{description()}
								</span>
							</span>
						</DropdownMenuRadioItem>
					))}
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
