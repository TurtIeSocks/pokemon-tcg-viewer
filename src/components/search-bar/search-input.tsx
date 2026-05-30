import { Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { usePokemonList } from "../../hooks/use-pokemon-list";
import { useNameQueryParam } from "../../hooks/use-url-selection";
import { useRecentsStore } from "../../store/recents";
import { displayName } from "../../utils/display-name";

const MAX_SUGGESTIONS = 8;
const DEBOUNCE_MS = 300;

interface SearchInputProps {
	placeholder?: string;
	autoFocus?: boolean;
	className?: string;
}

export function SearchInput({
	placeholder = "Search cards by name (e.g. Pikachu, Charizard)",
	autoFocus,
	className,
}: SearchInputProps) {
	const [query, setQuery] = useNameQueryParam();
	const addRecentSearch = useRecentsStore((s) => s.addRecentSearch);
	const list = usePokemonList();

	const [text, setText] = useState(query);
	const [open, setOpen] = useState(false);
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const lastCommitted = useRef(query);

	useEffect(() => {
		if (query !== lastCommitted.current) {
			setText(query);
			lastCommitted.current = query;
		}
	}, [query]);
	useEffect(
		() => () => {
			if (timer.current) clearTimeout(timer.current);
		},
		[],
	);

	const commit = (next: string) => {
		const trimmed = next.trim();
		lastCommitted.current = trimmed;
		setQuery(trimmed);
		if (trimmed) addRecentSearch(trimmed);
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

	return (
		<div className={cn("relative", className)}>
			<Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
			<Input
				value={text}
				onChange={onInput}
				autoFocus={autoFocus}
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
				placeholder={placeholder}
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
					{suggestions.map((p) => (
						<button
							key={p.name}
							type="button"
							onMouseDown={(e) => e.preventDefault()}
							onClick={() => pick(p.name)}
							className="flex w-full items-center px-3 py-2 text-left text-sm hover:bg-secondary"
						>
							{displayName(p.name)}
						</button>
					))}
				</div>
			)}
		</div>
	);
}
