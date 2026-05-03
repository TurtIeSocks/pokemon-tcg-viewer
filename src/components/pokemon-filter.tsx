import { useEffect, useMemo, useRef, useState } from "react";
import { usePokemonList } from "../hooks/use-pokemon-list";
import { displayName } from "../utils/display-name";
import "./pokemon-filter.css";

interface PokemonFilterProps {
	value: number | null;
	onChange: (pokedexNumber: number | null) => void;
}

const MAX_RESULTS = 10;

export function PokemonFilter({ value, onChange }: PokemonFilterProps) {
	const list = usePokemonList();
	const [query, setQuery] = useState("");
	const [isOpen, setIsOpen] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);

	// Tracks the last `value` we've reflected into `query`. If the next prop
	// change matches this, we know we already handled it (e.g. handleInput
	// triggered the value→null transition itself) and skip the sync — otherwise
	// we'd clobber a character the user just typed. Starts as `undefined` so
	// the very first sync (post-hydration / post-list-load) still runs.
	const syncedValueRef = useRef<number | null | undefined>(undefined);

	// Mirror the parent's selection back into the input so reloads / direct
	// `onChange` calls outside this component stay in sync.
	useEffect(() => {
		if (value === syncedValueRef.current) return;
		if (value !== null && list.length >= value) {
			setQuery(displayName(list[value - 1].name));
			syncedValueRef.current = value;
		} else if (value === null) {
			setQuery("");
			syncedValueRef.current = value;
		}
	}, [value, list]);

	useEffect(() => {
		function onDocClick(e: MouseEvent) {
			if (
				containerRef.current &&
				!containerRef.current.contains(e.target as Node)
			) {
				setIsOpen(false);
			}
		}
		document.addEventListener("mousedown", onDocClick);
		return () => document.removeEventListener("mousedown", onDocClick);
	}, []);

	const matches = useMemo(() => {
		const q = query.trim().toLowerCase();
		if (!q) return [];
		const startsWith: Array<{ name: string; index: number }> = [];
		const contains: Array<{ name: string; index: number }> = [];
		for (let i = 0; i < list.length; i++) {
			const name = list[i].name;
			if (name.startsWith(q)) startsWith.push({ name, index: i });
			else if (name.includes(q)) contains.push({ name, index: i });
			if (startsWith.length >= MAX_RESULTS) break;
		}
		return [...startsWith, ...contains].slice(0, MAX_RESULTS);
	}, [query, list]);

	function pick(index: number) {
		setQuery(displayName(list[index].name));
		setIsOpen(false);
		onChange(index + 1);
	}

	function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
		setQuery(e.target.value);
		setIsOpen(true);
		// Clear stale results as soon as the user starts editing.
		if (value !== null) {
			// Pre-record the null we're about to push so the sync effect treats
			// this as already-handled and doesn't overwrite the typed character.
			syncedValueRef.current = null;
			onChange(null);
		}
	}

	function clear() {
		setQuery("");
		setIsOpen(false);
		onChange(null);
	}

	function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
		if (e.key === "Enter" && matches.length > 0) {
			e.preventDefault();
			pick(matches[0].index);
		} else if (e.key === "Escape") {
			setIsOpen(false);
		}
	}

	const isLoading = list.length === 0;
	const showClear = query.length > 0 || value !== null;
	// Hide the dropdown if the only match would be the already-selected pokémon.
	const showList =
		isOpen &&
		matches.length > 0 &&
		!(matches.length === 1 && value !== null && matches[0].index + 1 === value);

	return (
		<div className="pokemon-filter" ref={containerRef}>
			<div className="pokemon-filter-input-wrap">
				<input
					type="text"
					className="pokemon-filter-input"
					placeholder={
						isLoading ? "Loading Pokémon…" : "Search by name (e.g. Pikachu)"
					}
					value={query}
					onChange={handleInput}
					onFocus={(e) => {
						if (value !== null) e.target.select();
					}}
					onKeyDown={handleKeyDown}
					disabled={isLoading}
					autoComplete="off"
					aria-label="Search Pokémon by name"
					aria-expanded={showList}
					aria-controls="pokemon-filter-list"
					role="combobox"
				/>
				{showClear && (
					<button
						type="button"
						className="pokemon-filter-clear"
						onClick={clear}
						aria-label="Clear selection"
					>
						×
					</button>
				)}
			</div>
			{showList && (
				<div
					id="pokemon-filter-list"
					className="pokemon-filter-list"
					role="listbox"
				>
					{matches.map((m) => (
						<div
							key={m.index}
							role="option"
							aria-selected={value === m.index + 1}
							tabIndex={-1}
						>
							<button
								type="button"
								className="pokemon-filter-option"
								onClick={() => pick(m.index)}
							>
								<span className="pokemon-filter-option-name">
									{displayName(m.name)}
								</span>
								<span className="pokemon-filter-option-id">
									#{String(m.index + 1).padStart(4, "0")}
								</span>
							</button>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
