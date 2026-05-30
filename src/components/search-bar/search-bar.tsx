import { Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFilterValues } from "../../hooks/use-filter-values";
import { usePokemonList } from "../../hooks/use-pokemon-list";
import { useNameQueryParam } from "../../hooks/use-url-selection";
import { displayName } from "../../utils/display-name";
import { FilterPopover } from "./filter-popover";

const MAX_SUGGESTIONS = 8;
const DEBOUNCE_MS = 300;

export function SearchBar() {
	const [query, setQuery] = useNameQueryParam();
	const [, setParams] = useSearchParams();
	const filterValues = useFilterValues();
	const list = usePokemonList();

	const [text, setText] = useState(query);
	const [open, setOpen] = useState(false);
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Mirror external query changes (back button, cross-link) into the box.
	const lastCommitted = useRef(query);
	useEffect(() => {
		if (query !== lastCommitted.current) {
			setText(query);
			lastCommitted.current = query;
		}
	}, [query]);

	const commit = (next: string) => {
		const trimmed = next.trim();
		lastCommitted.current = trimmed;
		setQuery(trimmed);
	};

	const onInput = (e: React.ChangeEvent<HTMLInputElement>) => {
		const next = e.target.value;
		setText(next);
		setOpen(true);
		if (timer.current) clearTimeout(timer.current);
		timer.current = setTimeout(() => commit(next), DEBOUNCE_MS);
	};

	const suggestions =
		text.trim().length > 0
			? list
					.filter((p) => p.name.startsWith(text.trim().toLowerCase()))
					.slice(0, MAX_SUGGESTIONS)
			: [];

	const pick = (name: string) => {
		const display = displayName(name);
		setText(display);
		setOpen(false);
		if (timer.current) clearTimeout(timer.current);
		commit(display);
	};

	const clearAll = () => {
		const next = new URLSearchParams();
		setParams(next);
		setText("");
		lastCommitted.current = "";
	};

	return (
		<div className="space-y-3">
			<div className="relative">
				<Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
				<Input
					value={text}
					onChange={onInput}
					onFocus={() => setOpen(true)}
					onBlur={() => setTimeout(() => setOpen(false), 120)}
					onKeyDown={(e) => {
						if (e.key === "Enter") {
							e.preventDefault();
							if (timer.current) clearTimeout(timer.current);
							commit(text);
							setOpen(false);
						} else if (e.key === "Escape") {
							setText("");
							commit("");
						}
					}}
					placeholder="Search cards by name (e.g. Pikachu, Charizard)"
					aria-label="Search cards by name"
					className="h-11 pl-10 pr-10"
				/>
				{text && (
					<Button
						variant="ghost"
						size="icon"
						onClick={() => {
							setText("");
							commit("");
						}}
						className="absolute right-1 top-1/2 size-8 -translate-y-1/2"
						aria-label="Clear search"
					>
						<X className="size-4" />
					</Button>
				)}
				{open && suggestions.length > 0 && (
					<div className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
						{suggestions.map((p, i) => (
							<button
								key={p.name}
								type="button"
								onMouseDown={(e) => e.preventDefault()}
								onClick={() => pick(p.name)}
								className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-secondary"
							>
								<span>{displayName(p.name)}</span>
								<span className="text-xs text-muted-foreground">
									#{String(i + 1).padStart(4, "0")}
								</span>
							</button>
						))}
					</div>
				)}
			</div>
			<div className="flex flex-wrap items-center gap-2">
				<FilterPopover
					label="Type"
					paramName="types"
					options={filterValues.types}
				/>
				<FilterPopover
					label="Rarity"
					paramName="rarity"
					options={filterValues.rarities}
				/>
				<FilterPopover
					label="Supertype"
					paramName="supertype"
					options={filterValues.supertypes}
				/>
				<FilterPopover
					label="Subtype"
					paramName="subtypes"
					options={filterValues.subtypes}
				/>
				<Button
					variant="ghost"
					size="sm"
					onClick={clearAll}
					className="text-muted-foreground"
				>
					Clear all
				</Button>
			</div>
		</div>
	);
}
